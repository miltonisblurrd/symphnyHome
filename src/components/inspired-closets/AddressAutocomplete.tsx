"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { AddressParts, PlaceSuggestion } from "@/lib/inspired-closets-google-places";
import styles from "./address-autocomplete.module.css";

type Props = {
  value: string;
  onChange: (street: string) => void;
  onResolved: (parts: AddressParts) => void;
  inputClassName?: string;
  placeholder?: string;
  id?: string;
};

export default function AddressAutocomplete({
  value,
  onChange,
  onResolved,
  inputClassName,
  placeholder = "Start typing an address…",
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [active, setActive] = useState(0);
  const [provider, setProvider] = useState<"google" | "none" | null>(null);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipRef = useRef(false);

  function syncBox() {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }

  useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/inspired-closets/ops/places?q=${encodeURIComponent(query)}`,
            { signal: controller.signal },
          );
          const payload = (await response.json()) as {
            ok?: boolean;
            suggestions?: PlaceSuggestion[];
            provider?: "google" | "none";
          };
          if (!payload.ok) return;
          setSuggestions(payload.suggestions ?? []);
          setProvider(payload.provider ?? null);
          setActive(0);
          setOpen((payload.suggestions ?? []).length > 0);
          syncBox();
        } catch (error) {
          if ((error as { name?: string }).name === "AbortError") return;
        }
      })();
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    syncBox();
    function onScroll() {
      syncBox();
    }
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function pick(suggestion: PlaceSuggestion) {
    skipRef.current = true;
    setOpen(false);
    setSuggestions([]);
    if (suggestion.parts) {
      onChange(suggestion.parts.street);
      onResolved(suggestion.parts);
      return;
    }
    onChange(suggestion.label.split(",")[0] ?? suggestion.label);
    try {
      const response = await fetch(
        `/api/inspired-closets/ops/places?placeId=${encodeURIComponent(suggestion.id)}`,
      );
      const payload = (await response.json()) as { ok?: boolean; parts?: AddressParts };
      if (payload.ok && payload.parts) {
        skipRef.current = true;
        onChange(payload.parts.street);
        onResolved(payload.parts);
      }
    } catch {
      /* keep the typed street */
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = suggestions[active];
      if (choice) void pick(choice);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  const list =
    open && suggestions.length > 0 && box && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={listRef}
            className={styles.list}
            role="listbox"
            style={{ top: box.top, left: box.left, width: box.width }}
          >
            {provider === "google" ? <li className={styles.hint}>Google Maps</li> : null}
            {suggestions.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={`${styles.item} ${index === active ? styles.itemActive : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void pick(item)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <input
        ref={inputRef}
        id={id}
        className={inputClassName}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) {
            syncBox();
            setOpen(true);
          }
        }}
        onKeyDown={onKeyDown}
      />
      {list}
    </div>
  );
}
