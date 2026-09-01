"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import styles from "./receiving.module.css";

type Item = {
  id: string;
  item_number: string;
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
  const videoRef = useRef<HTMLVideoElement>(null);
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
    setItems(payload.items ?? []);
    setStats(payload.stats ?? null);
    if (payload.shipment?.notice) setNotice(payload.shipment.notice);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const tesseract = await import("tesseract.js");
        const worker = await tesseract.createWorker("eng", 1);
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789 ",
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
    };
  }, []);

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
  }, [load, pallet, shipmentId]);

  const loop = useCallback(async () => {
    if (!holdRef.current || !workerRef.current || !videoRef.current || !canvasRef.current) {
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(() => void loop());
      return;
    }
    const bandY = Math.floor(video.videoHeight * 0.36);
    const bandH = Math.floor(video.videoHeight * 0.28);
    canvas.width = video.videoWidth;
    canvas.height = bandH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, bandY, video.videoWidth, bandH, 0, 0, canvas.width, canvas.height);
    try {
      const { data } = await workerRef.current.recognize(canvas);
      const code = (data.text || "").replace(/\D/g, "");
      const now = Date.now();
      if (code.length >= 6 && (code !== lastCodeRef.current.code || now - lastCodeRef.current.at > 1200)) {
        lastCodeRef.current = { code, at: now };
        await postScan(code);
      }
    } catch {
      /* keep looping */
    }
    if (holdRef.current) rafRef.current = requestAnimationFrame(() => void loop());
  }, [postScan]);

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
      if (!q) return true;
      return `${item.item_number} ${item.cust_ref} ${item.job_name} ${item.description}`
        .toLowerCase()
        .includes(q);
    });
  }, [items, pallet, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of visible) {
      const key = item.cust_ref || item.job_name || "Unassigned";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible]);

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
          <p className={styles.scanBrand}>Inspired Closets{notice ? ` · ${notice}` : ""}</p>
        </div>
        <Link href={`/inspired-closets/ops/inventory/receiving/${shipmentId}`} className={styles.scanNav}>
          Summary
        </Link>
      </header>

      <div className={styles.palletContext}>
        {pallet && activePallet ? (
          <span>
            Pallet {shortPallet(pallet)} {activePallet.total_received_qty}/{activePallet.total_qty} tap to change
          </span>
        ) : (
          <span>Entire truck · tap a pallet</span>
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
        {(stats?.by_container ?? []).map((row) => (
          <button
            key={row.container_id}
            type="button"
            className={`${styles.palletChip} ${pallet === row.container_id ? styles.palletOn : ""}`}
            onClick={() => setPallet(row.container_id)}
          >
            {shortPallet(row.container_id)} {row.total_received_qty}/{row.total_qty}
          </button>
        ))}
      </div>

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
          <div className={styles.cameraWrap}>
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
        <input
          className={styles.searchBox}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Item #, client, description"
          autoFocus
        />
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
                  <button type="button" onClick={() => void bump(item, 1)}>
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
