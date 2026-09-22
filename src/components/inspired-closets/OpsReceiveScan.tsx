"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./receiving.module.css";
import {
  extractAndMatch,
  isStowItemCode,
  shipmentHasVendorSkus,
  type MatchableLine,
} from "@/lib/inspired-closets-ops-scan-codes";
import {
  binarize,
  cropScanBand,
  invertCanvas,
  readBarcodes,
  rotateCanvas,
} from "@/lib/inspired-closets-ops-scan-camera";

type Item = {
  id: string;
  item_number: string;
  vendor_sku?: string | null;
  cust_ref: string | null;
  job_name: string | null;
  description: string | null;
  qty: number;
  received_qty: number;
  container_id: string | null;
  status: string;
  needs_credit?: boolean;
};

type Stats = {
  total_qty: number;
  total_received_qty: number;
  pct: number;
  by_container: Array<{ container_id: string; total_qty: number; total_received_qty: number }>;
};

type Banner = {
  title: string;
  detail: string;
  warn?: boolean;
};

type ScanLogRow = {
  item_number: string;
  job: string;
  description: string;
  qty: number;
};

const OFFLINE_KEY = "ic-receiving-offline";
const LAST_TRUCK_KEY = "ic-receiving-last";
const SESSION_KEY = "ic-receiving-session";

function readOffline(): Array<{ shipmentId: string; item_number: string; qty: number; pallet: string | null }> {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) ?? "[]") as Array<{
      shipmentId: string;
      item_number: string;
      qty: number;
      pallet: string | null;
    }>;
  } catch {
    return [];
  }
}

function writeOffline(
  rows: Array<{ shipmentId: string; item_number: string; qty: number; pallet: string | null }>,
) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(rows));
}

function jobLabel(item?: Item | null): string {
  return item?.cust_ref || item?.job_name || "Unassigned";
}

function shortPallet(id: string): string {
  const digits = id.replace(/\D/g, "");
  const tail = (digits || id).slice(-4);
  return `…${tail}`;
}

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    /* ignore */
  }
}

export default function OpsReceiveScan({ shipmentId }: { shipmentId: string }) {
  const [tab, setTab] = useState<"scan" | "search" | "browse">("scan");
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notice, setNotice] = useState("");
  const [pallet, setPallet] = useState<string>("");
  const [query, setQuery] = useState("");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [lastItem, setLastItem] = useState<Item | null>(null);
  const [lastQty, setLastQty] = useState(1);
  const [scanLog, setScanLog] = useState<ScanLogRow[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [sessionPieces, setSessionPieces] = useState(0);
  const [sessionStarted, setSessionStarted] = useState<number | null>(null);
  const [browseOpenOnly, setBrowseOpenOnly] = useState(false);
  const [browseBy, setBrowseBy] = useState<"job" | "pallet">("job");
  const [searchQty, setSearchQty] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Item[]>([]);
  const missStreakRef = useRef<{ code: string; n: number }>({ code: "", n: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<import("tesseract.js").Worker | null>(null);
  const holdRef = useRef(false);
  const rafRef = useRef(0);
  const lastCodeRef = useRef({ code: "", at: 0 });
  const streamRef = useRef<MediaStream | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/inspired-closets/ops/receiving/shipments/${shipmentId}`);
    const payload = (await response.json()) as {
      ok: boolean;
      error?: string;
      shipment?: { notice?: string };
      items?: Item[];
      stats?: Stats;
    };
    if (!payload.ok) {
      setNotice(payload.error ?? "Could not load shipment.");
      return;
    }
    const next = payload.items ?? [];
    itemsRef.current = next;
    setItems(next);
    setStats(payload.stats ?? null);
    if (payload.shipment?.notice) setNotice(payload.shipment.notice);
  }, [shipmentId]);

  useEffect(() => {
    localStorage.setItem(LAST_TRUCK_KEY, shipmentId);
    const raw = localStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as { id?: string; started?: number; pieces?: number }) : null;
    if (parsed?.id === shipmentId && parsed.started) {
      setSessionStarted(parsed.started);
      setSessionPieces(parsed.pieces ?? 0);
    } else {
      const started = Date.now();
      setSessionStarted(started);
      setSessionPieces(0);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ id: shipmentId, started, pieces: 0 }));
    }
  }, [shipmentId]);

  useEffect(() => {
    void load();
    void (async () => {
      const queued = readOffline().filter((row) => row.shipmentId === shipmentId);
      const rest = readOffline().filter((row) => row.shipmentId !== shipmentId);
      for (const row of queued) {
        try {
          await fetch(`/api/inspired-closets/ops/receiving/shipments/${shipmentId}/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(row),
          });
        } catch {
          rest.push(row);
        }
      }
      writeOffline(rest);
      if (queued.length) await load();
    })();
  }, [load, shipmentId]);

  const letterMode = shipmentHasVendorSkus(items);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tesseract = await import("tesseract.js");
        const worker = await tesseract.createWorker("eng", 1, { logger: () => undefined });
        await worker.setParameters({
          tessedit_char_whitelist: letterMode
            ? "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ "
            : "0123456789 ",
          tessedit_pageseg_mode: "6" as unknown as import("tesseract.js").PSM,
        });
        if (cancelled) {
          await worker.terminate();
          return;
        }
        workerRef.current = worker;
        setOcrReady(true);
      } catch {
        setOcrReady(false);
      }
    })();
    return () => {
      cancelled = true;
      void workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [letterMode]);

  useEffect(() => {
    if (tab !== "scan") return;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setBanner({ title: "Camera blocked", detail: "Use Search or Browse.", warn: true });
      }
    })();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [tab]);

  const postScan = useCallback(async (code: string, qty = 1) => {
    try {
      const response = await fetch(
        `/api/inspired-closets/ops/receiving/shipments/${shipmentId}/scan`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item_number: code,
            qty,
            pallet: pallet || null,
          }),
        },
      );
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        last?: { result: string; item: Item | null };
        stats?: Stats;
      };
      if (!payload.ok) throw new Error(payload.error ?? "Scan failed.");
      if (payload.stats) setStats(payload.stats);
      const last = payload.last;
      if (!last) return;
      if (last.result === "unknown") {
        beep(false);
        setLastItem(null);
        setBanner({ title: "Unknown scan", detail: code, warn: true });
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([80, 40, 80]);
        }
      } else if (last.result === "already_received") {
        beep(false);
        setLastItem(last.item);
        setLastQty(qty);
        setBanner({
          title: "Already in",
          detail: `${jobLabel(last.item)} · #${last.item?.item_number ?? code}`,
          warn: true,
        });
      } else {
        beep(true);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(40);
        setLastItem(last.item);
        setLastQty(qty);
        setBanner({
          title: last.result === "pallet_mismatch" ? "Other pallet" : "SCANNED",
          detail: jobLabel(last.item),
        });
        if (last.item) {
          setSessionPieces((count) => {
            const next = count + qty;
            const started = sessionStarted ?? Date.now();
            localStorage.setItem(
              SESSION_KEY,
              JSON.stringify({ id: shipmentId, started, pieces: next }),
            );
            return next;
          });
          setScanLog((rows) =>
            [
              {
                item_number: last.item?.item_number ?? code,
                job: jobLabel(last.item),
                description: last.item?.description ?? "",
                qty,
              },
              ...rows,
            ].slice(0, 20),
          );
        }
      }
      await load();
    } catch (error) {
      writeOffline([
        ...readOffline(),
        { shipmentId, item_number: code, qty, pallet: pallet || null },
      ]);
      setBanner({
        title: "Saved offline",
        detail: error instanceof Error ? error.message : "Will retry when you're back online.",
        warn: true,
      });
    }
  }, [load, pallet, sessionStarted, shipmentId]);

  const considerRead = useCallback(
    async (text: string) => {
      const lines = itemsRef.current as MatchableLine[];
      const matched = extractAndMatch(text, lines);
      const now = Date.now();
      if (matched) {
        missStreakRef.current = { code: "", n: 0 };
        if (matched !== lastCodeRef.current.code || now - lastCodeRef.current.at > 1200) {
          lastCodeRef.current = { code: matched, at: now };
          await postScan(matched);
        }
        return;
      }
      const nines = text.toUpperCase().match(/\d{9}/g) ?? [];
      const stow = nines.find((code) => isStowItemCode(code));
      if (!stow) {
        missStreakRef.current = { code: "", n: 0 };
        return;
      }
      const streak =
        missStreakRef.current.code === stow ? missStreakRef.current.n + 1 : 1;
      missStreakRef.current = { code: stow, n: streak };
      if (streak < 3) return;
      missStreakRef.current = { code: "", n: 0 };
      if (stow !== lastCodeRef.current.code || now - lastCodeRef.current.at > 1200) {
        lastCodeRef.current = { code: stow, at: now };
        await postScan(stow);
      }
    },
    [postScan],
  );

  const loop = useCallback(async () => {
    if (!holdRef.current || !workerRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const host = stageRef.current ?? video.parentElement;
    if (video.readyState < 2 || !host) {
      rafRef.current = requestAnimationFrame(() => void loop());
      return;
    }
    const cropped = cropScanBand(video, host);
    if (!cropped) {
      rafRef.current = requestAnimationFrame(() => void loop());
      return;
    }
    const canvas = cropped.canvas;
    if (canvasRef.current) {
      canvasRef.current.width = canvas.width;
      canvasRef.current.height = canvas.height;
      canvasRef.current.getContext("2d")?.drawImage(canvas, 0, 0);
    }
    try {
      const barcodes = await readBarcodes(canvas);
      for (const code of barcodes) await considerRead(code);
      binarize(canvas);
      const worker = workerRef.current;
      const reads = [canvas];
      const first = await worker.recognize(canvas);
      const firstText = first.data.text || "";
      const hasNine = /\d{9}/.test(firstText.replace(/\D/g, ""));
      if (!hasNine && !letterMode) {
        reads.push(invertCanvas(canvas), rotateCanvas(canvas, 1), rotateCanvas(canvas, -1));
      }
      const texts = [firstText];
      for (const frame of reads.slice(1)) {
        const next = await worker.recognize(frame);
        texts.push(next.data.text || "");
      }
      await considerRead(texts.join(" "));
    } catch {
      /* keep looping */
    }
    if (holdRef.current) rafRef.current = requestAnimationFrame(() => void loop());
  }, [considerRead, letterMode]);

  function startHold() {
    if (!ocrReady) {
      setBanner({ title: "OCR not ready", detail: "Wait a second, or use Search.", warn: true });
      return;
    }
    holdRef.current = true;
    setScanning(true);
    rafRef.current = requestAnimationFrame(() => void loop());
  }

  function stopHold() {
    holdRef.current = false;
    setScanning(false);
    cancelAnimationFrame(rafRef.current);
  }

  async function syncNow() {
    setSyncing(true);
    try {
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function undoLast() {
    if (!lastItem) return;
    try {
      await fetch(`/api/inspired-closets/ops/receiving/shipments/${shipmentId}/items/${lastItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unreceive", qty: lastQty }),
      });
      setScanLog((rows) => rows.slice(1));
      setLastItem(null);
      setBanner(null);
      await load();
    } catch (error) {
      setBanner({
        title: "Undo failed",
        detail: error instanceof Error ? error.message : "Try Browse −",
        warn: true,
      });
    }
  }

  async function markCredit(item: Item, on = true) {
    try {
      const response = await fetch(
        `/api/inspired-closets/ops/receiving/shipments/${shipmentId}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: on ? "credit" : "clear_credit",
            description: "Vendor credit — still using the piece",
          }),
        },
      );
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not flag credit.");
      setLastItem({ ...item, needs_credit: on });
      setBanner({
        title: on ? "On the credit list" : "Credit cleared",
        detail: on
          ? `${item.item_number} stays on the job. File vendor credit after the truck.`
          : `${item.item_number} off the credit list.`,
      });
      await load();
    } catch (error) {
      setBanner({
        title: "Didn't stick",
        detail: error instanceof Error ? error.message : "Try again",
        warn: true,
      });
    }
  }

  async function bump(item: Item, delta: number) {
    try {
      if (delta > 0) {
        await postScan(item.item_number, delta);
      } else {
        await fetch(
          `/api/inspired-closets/ops/receiving/shipments/${shipmentId}/items/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "unreceive", qty: Math.abs(delta) }),
          },
        );
        await load();
      }
    } catch (error) {
      setBanner({
        title: "Didn't stick",
        detail: error instanceof Error ? error.message : "Try again",
        warn: true,
      });
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (pallet && item.container_id !== pallet) return false;
      if (tab === "browse" && browseOpenOnly && item.received_qty >= item.qty) return false;
      if (!q) return true;
      return `${item.item_number} ${item.vendor_sku ?? ""} ${item.cust_ref} ${item.job_name} ${item.description}`
        .toLowerCase()
        .includes(q);
    });
  }, [browseOpenOnly, items, pallet, query, tab]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visible) {
      const key =
        browseBy === "pallet"
          ? item.container_id || "No pallet"
          : item.cust_ref || item.job_name || "Unassigned";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [browseBy, visible]);

  const creditQueue = useMemo(
    () =>
      items.filter((item) => {
        if (!item.needs_credit) return false;
        if (pallet && item.container_id !== pallet) return false;
        return true;
      }),
    [items, pallet],
  );

  const activePallet = (stats?.by_container ?? []).find((row) => row.container_id === pallet);
  const focusReceived = activePallet?.total_received_qty ?? stats?.total_received_qty ?? 0;
  const focusQty = activePallet?.total_qty ?? stats?.total_qty ?? 0;
  const focusPct = focusQty > 0 ? Math.round((focusReceived / focusQty) * 100) : 0;
  const hit = Boolean(lastItem && banner && !banner.warn);

  return (
    <div className={`${styles.scanPage} ${hit ? styles.scanHit : ""}`}>
      <header className={styles.scanChrome}>
        <Link href={`/inspired-closets/ops/inventory/receiving/${shipmentId}`} className={styles.scanNav}>
          Back
        </Link>
        <div className={styles.scanCounts}>
          <p className={styles.scanHeroCount}>
            {focusReceived}/{focusQty} {focusPct}%
          </p>
          <button type="button" className={styles.scanSync} onClick={() => void syncNow()}>
            {stats?.total_received_qty ?? 0}/{stats?.total_qty ?? 0} total / {syncing ? "syncing…" : "tap to sync"}
          </button>
          <p className={styles.scanBrand}>
            {sessionPieces} this session
            {sessionStarted
              ? ` · ${Math.max(1, Math.round((Date.now() - sessionStarted) / 60000))} min`
              : ""}
          </p>
          <p className={styles.scanBrand}>Inspired Closets{notice ? ` · ${notice}` : ""}</p>
        </div>
        <Link href={`/inspired-closets/ops/inventory/receiving/${shipmentId}/summary`} className={styles.scanNav}>
          Summary
        </Link>
      </header>

      {items.some((item) => item.container_id) ? null : (
        <div className={styles.palletContext}>
          <span>Vendor labels · one scan is one piece</span>
        </div>
      )}
      {items.some((item) => item.container_id) ? (
        <>
          <div className={styles.palletContext}>
            {pallet && activePallet ? (
              <span>
                Pallet {shortPallet(pallet)} {activePallet.total_received_qty}/{activePallet.total_qty} · accurate
              </span>
            ) : (
              <span>Entire truck · less accurate · pick a pallet first</span>
            )}
          </div>
          <div className={styles.palletBar}>
            <button
              type="button"
              className={`${styles.palletChip} ${!pallet ? styles.palletOn : ""}`}
              onClick={() => setPallet("")}
            >
              Entire truck
            </button>
            {(stats?.by_container ?? []).map((row) => {
              const lines = items.filter((item) => item.container_id === row.container_id);
              const settled = lines.length > 0 && lines.every((item) => item.received_qty >= item.qty || item.status === "missing" || item.status === "damaged");
              const short = settled && lines.some((item) => item.received_qty < item.qty);
              return (
                <button
                  key={row.container_id}
                  type="button"
                  className={`${styles.palletChip} ${pallet === row.container_id ? styles.palletOn : ""}`}
                  onClick={() => setPallet(row.container_id)}
                >
                  {shortPallet(row.container_id)} {row.total_received_qty}/{row.total_qty}
                  {settled ? (short ? " · shorts" : " · done") : ""}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {lastItem && banner && !banner.warn ? (
        <div className={styles.successBanner}>
          <div>
            <p className={styles.successJob}>{jobLabel(lastItem)}</p>
            <p className={styles.successDesc}>{lastItem.description ?? ""}</p>
            <p className={styles.successMeta}>
              #{lastItem.item_number} · Qty: {lastQty}
              {banner.title === "Other pallet" ? " · other pallet" : ""}
            </p>
          </div>
          <button type="button" className={styles.undoBtn} onClick={() => void undoLast()}>
            Undo
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              data.set("shipment_id", shipmentId);
              data.set("item_id", lastItem.id);
              data.set("description", `${jobLabel(lastItem)} ${lastItem.item_number}`);
              void fetch("/api/inspired-closets/ops/receiving/claims", { method: "POST", body: data }).then(() => {
                setBanner({ title: "Claim saved", detail: "It stays on the job until someone submits it." });
              });
            }}
          >
            <select name="claim_type" defaultValue="DAMAGED">
              <option value="DAMAGED">Damaged</option>
              <option value="MISSING">Missing</option>
              <option value="DEFECTIVE">Defective</option>
              <option value="WRONG">Wrong item</option>
            </select>
            <input name="photos" type="file" accept="image/*" multiple />
            <button type="submit">Flag</button>
          </form>
        </div>
      ) : banner ? (
        <div className={`${styles.banner} ${styles.bannerWarn}`}>
          <h3>{banner.title}</h3>
          <p>{banner.detail}</p>
        </div>
      ) : null}

      <nav className={styles.tabs}>
        {(
          [
            ["scan", "Scan"],
            ["search", "Search"],
            ["browse", "Browse"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${tab === id ? styles.tabOn : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "scan" ? (
        <>
          <div className={styles.cameraWrap} ref={stageRef}>
            <video ref={videoRef} playsInline muted autoPlay />
            <div className={styles.scanBand} />
            {hit && lastItem ? (
              <div className={styles.scannedOverlay}>
                <p className={styles.overlayKicker}>SCANNED</p>
                <p className={styles.overlayJob}>{jobLabel(lastItem)}</p>
                <p className={styles.overlayDesc}>{lastItem.description ?? ""}</p>
                <p className={styles.overlayMeta}>#{lastItem.item_number}</p>
              </div>
            ) : null}
            <canvas ref={canvasRef} hidden />
          </div>
          <button
            type="button"
            className={`${styles.holdBtn} ${scanning ? styles.holdScanning : ""} ${hit ? styles.holdSuccess : ""}`}
            onPointerDown={startHold}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
          >
            {scanning ? "SCANNING…" : ocrReady ? "HOLD TO SCAN NEXT" : "Starting camera…"}
          </button>
        </>
      ) : null}

      {tab === "search" ? (
        <div style={{ display: "flex", gap: "0.5rem", padding: "0 1rem" }}>
          <input
            className={styles.searchBox}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item #, vendor #, client, description"
            autoFocus
            style={{ flex: 1 }}
          />
          <input
            className={styles.searchBox}
            type="number"
            min={1}
            value={searchQty}
            onChange={(e) => setSearchQty(Math.max(1, Number(e.target.value) || 1))}
            aria-label="Quantity"
            style={{ width: "4.5rem" }}
          />
        </div>
      ) : null}

      {tab === "browse" ? (
        <div style={{ display: "flex", gap: "0.5rem", padding: "0 1rem 0.5rem" }}>
          <button type="button" className={styles.palletChip} onClick={() => setBrowseOpenOnly((open) => !open)}>
            {browseOpenOnly ? "Still open" : "All lines"}
          </button>
          <button
            type="button"
            className={styles.palletChip}
            onClick={() => setBrowseBy((mode) => (mode === "job" ? "pallet" : "job"))}
          >
            {browseBy === "job" ? "By customer" : "By pallet"}
          </button>
        </div>
      ) : null}

      {(tab === "search" || tab === "browse") &&
        grouped.map(([group, rows]) => (
          <div key={group}>
            <p className={styles.scanMeta} style={{ padding: "0 1rem" }}>
              {group}
            </p>
            {rows.map((item) => (
              <div key={item.id} className={styles.browseItem}>
                <div>
                  <div className={styles.mono}>{item.item_number}</div>
                  <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    {item.description ?? "—"} · {item.received_qty}/{item.qty}
                    {item.needs_credit ? " · credit later" : ""}
                  </div>
                </div>
                <div className={styles.qtyBtns}>
                  <button type="button" onClick={() => void bump(item, -1)}>
                    −
                  </button>
                  <button type="button" onClick={() => void bump(item, tab === "search" ? searchQty : 1)}>
                    +
                  </button>
                  {item.qty - item.received_qty > 1 ? (
                    <button type="button" onClick={() => void bump(item, item.qty - item.received_qty)}>
                      All
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.creditBtn}
                    onClick={() => void markCredit(item, !item.needs_credit)}
                  >
                    {item.needs_credit ? "Undo credit" : "Credit"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab !== "scan" ? (
        <section className={styles.creditQueue}>
          <h3>Need credit after this truck</h3>
          <p>
            Blue-tape it, keep scanning. These pieces stay on the job — file the vendor list when
            the last pallet is in.
          </p>
          {creditQueue.length === 0 ? (
            <p>Nothing flagged yet.</p>
          ) : (
            creditQueue.map((item) => (
              <div key={item.id} className={styles.creditRow}>
                <div>
                  <strong className={styles.mono}>{item.item_number}</strong>
                  <div style={{ color: "#a8a29e", fontSize: "0.75rem" }}>
                    {item.job_name ?? item.cust_ref ?? "—"} · {item.description ?? ""}
                  </div>
                </div>
                <button type="button" className={styles.creditBtn} onClick={() => void markCredit(item, false)}>
                  Done
                </button>
              </div>
            ))
          )}
        </section>
      ) : (
        <section className={styles.scanLog}>
          <button type="button" className={styles.scanLogToggle} onClick={() => setLogOpen((open) => !open)}>
            Scan Log · {scanLog.length}
          </button>
          {logOpen
            ? scanLog.map((row, index) => (
                <div key={`${row.item_number}-${index}`} className={styles.scanLogRow}>
                  <strong>{row.job}</strong>
                  <span>
                    #{row.item_number} · {row.description} · Qty {row.qty}
                  </span>
                </div>
              ))
            : null}
        </section>
      )}
    </div>
  );
}
