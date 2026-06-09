"use client";

import { useState, useEffect } from "react";
import { nip19, nip05 } from "nostr-tools";
import { getPool, list } from "@/lib/pool";
import { KIND, ISSUER_PUBKEY } from "@/lib/constants";
import { computeMatch, useTraderInfo, useAllTraders } from "@/hooks/useTraders";
import { CATALOG, RARITY_META } from "@/lib/catalog";
import { useLang } from "@/contexts/LangContext";
import type { Ownership } from "@/lib/types";

export function Traders({
  myOwnership,
  myPubkey,
}: {
  myOwnership: Ownership;
  myPubkey: string | null;
}) {
  const { t } = useLang();
  const [subTab, setSubTab] = useState<"search" | "discover">("search");
  const [searchInput, setSearchInput] = useState("");
  const [searchPubkey, setSearchPubkey] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [discoverEnabled, setDiscoverEnabled] = useState(false);
  const [selectedPubkey, setSelectedPubkey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{
    pubkey: string; npub: string; name?: string; picture?: string; nip05?: string;
  }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [playerPubkeys, setPlayerPubkeys] = useState<Set<string>>(new Set());

  // Load active player pubkeys once for search prioritization
  useEffect(() => {
    if (!ISSUER_PUBKEY) return;
    list([{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], limit: 500 }])
      .then(events => {
        const pks = new Set(events.flatMap(ev => ev.tags.filter(t => t[0] === "p").map(t => t[1])));
        setPlayerPubkeys(pks);
      })
      .catch(() => {});
  }, []);

  // NIP-50 live search as user types
  useEffect(() => {
    setSuggestions([]);
    const input = searchInput.trim();
    if (!input || input.startsWith("npub1") || /^[0-9a-f]{64}$/i.test(input)) return;

    const atIdx = input.indexOf("@");
    const afterAt = atIdx > 0 ? input.slice(atIdx + 1) : "";
    const isCompleteNip05 = atIdx > 0 && afterAt.includes(".");
    if (isCompleteNip05) return; // let handleSearch handle it on submit

    const searchTerm = atIdx > 0 ? input.slice(0, atIdx) : input;
    if (searchTerm.length < 2) return;

    setLoadingSuggestions(true);
    const timer = setTimeout(async () => {
      try {
        const pool = getPool();
        const evs = await pool.querySync(
          ["wss://relay.nostr.band", "wss://search.nos.today"],
          { kinds: [0], search: searchTerm, limit: 8 },
          { maxWait: 4000 }
        );
        const seen = new Set<string>();
        const results = evs.flatMap(ev => {
          if (seen.has(ev.pubkey)) return [];
          seen.add(ev.pubkey);
          try {
            const m = JSON.parse(ev.content);
            return [{
              pubkey: ev.pubkey,
              npub: nip19.npubEncode(ev.pubkey),
              name: m.name || m.display_name || m.username,
              picture: m.picture,
              nip05: m.nip05,
            }];
          } catch { return []; }
        });
        results.sort((a, b) => (playerPubkeys.has(b.pubkey) ? 1 : 0) - (playerPubkeys.has(a.pubkey) ? 1 : 0));
        setSuggestions(results);
      } catch { /* silent */ } finally {
        setLoadingSuggestions(false);
      }
    }, 400);
    return () => { clearTimeout(timer); setLoadingSuggestions(false); };
  }, [searchInput]);

  function selectSuggestion(s: { pubkey: string; npub: string; name?: string; picture?: string; nip05?: string }) {
    setSearchInput(s.npub);
    setSearchPubkey(s.pubkey);
    setSuggestions([]);
    setSearchError(null);
  }

  // Single trader lookup (search tab)
  const { info: searchedTrader, loading: searchLoading } = useTraderInfo(
    subTab === "search" ? searchPubkey : null
  );

  // All traders (discover tab)
  const { traders: rawTraders, loading: discoverLoading } = useAllTraders(discoverEnabled);

  // Sort traders by match score, excluding self
  const sortedTraders = rawTraders
    .filter((tr) => tr.pubkey !== myPubkey)
    .map((tr) => {
      const m = computeMatch(myOwnership, tr.ownership);
      return { ...tr, iOffer: m.iOffer, theyOffer: m.theyOffer, score: m.iOffer.length + m.theyOffer.length };
    })
    .sort((a, b) => b.score - a.score);

  // Selected trader from discover list (already has ownership data)
  const selectedRow = selectedPubkey
    ? sortedTraders.find((tr) => tr.pubkey === selectedPubkey) ?? null
    : null;

  // Active match to display
  const activeTrader = subTab === "search" ? searchedTrader : selectedRow;
  const activeMatch =
    activeTrader
      ? subTab === "search"
        ? computeMatch(myOwnership, activeTrader.ownership)
        : selectedRow
          ? { iOffer: selectedRow.iOffer, theyOffer: selectedRow.theyOffer }
          : null
      : null;

  async function handleSearch() {
    setSearchError(null);
    const input = searchInput.trim();
    if (!input) return;

    // npub1…
    if (input.startsWith("npub1")) {
      try {
        const decoded = nip19.decode(input);
        if (decoded.type === "npub") {
          setSearchPubkey(decoded.data as string);
          return;
        }
      } catch {}
      setSearchError(t.traders_invalid_npub);
      return;
    }

    // hex pubkey (64 hex chars)
    if (/^[0-9a-f]{64}$/i.test(input)) {
      setSearchPubkey(input);
      return;
    }

    // NIP-05 identifier: name@domain.com or just name (tries _@input as domain)
    if (input.includes("@") || !input.includes(" ")) {
      setResolving(true);
      try {
        const pointer = await nip05.queryProfile(input);
        if (pointer?.pubkey) {
          setSearchPubkey(pointer.pubkey);
        } else {
          setSearchError(t.traders_nip05_not_found);
        }
      } catch {
        setSearchError(t.traders_nip05_not_found);
      } finally {
        setResolving(false);
      }
      return;
    }

    setSearchError(t.traders_invalid_npub);
  }

  function copyNpub(pubkey: string) {
    try {
      const npub = nip19.npubEncode(pubkey);
      navigator.clipboard.writeText(npub);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const panelVisible = activeTrader !== null;

  return (
    <div>
      <div
        style={{
          fontFamily: "var(--condensed)",
          fontWeight: 900,
          fontSize: 14,
          letterSpacing: 1,
          color: "var(--ink)",
          marginBottom: 4,
        }}
      >
        {t.traders_title}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
        {t.traders_subtitle}
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["search", "discover"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setSubTab(tab);
              setSelectedPubkey(null);
            }}
            style={{
              background: subTab === tab ? "var(--gold)" : "transparent",
              color: subTab === tab ? "#030b18" : "var(--muted)",
              border: subTab === tab ? "none" : "1px solid var(--line)",
              padding: "5px 14px",
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 900,
              fontFamily: "var(--condensed)",
              letterSpacing: 0.5,
              cursor: "pointer",
            }}
          >
            {tab === "search" ? t.traders_search_tab : t.traders_discover_tab}
          </button>
        ))}
      </div>

      {/* ── BUSCAR ── */}
      {subTab === "search" && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setSearchError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { setSuggestions([]); handleSearch(); }
                  if (e.key === "Escape") setSuggestions([]);
                }}
                placeholder={t.traders_search_placeholder}
                style={{
                  flex: 1,
                  background: "var(--panel)",
                  border: "1px solid var(--line)",
                  borderRadius: suggestions.length > 0 || loadingSuggestions ? "8px 8px 0 0" : "8px",
                  padding: "10px 12px",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontFamily: "var(--condensed)",
                  outline: "none",
                }}
              />
              <button
                onClick={() => { setSuggestions([]); handleSearch(); }}
                disabled={resolving}
                style={{
                  background: resolving ? "var(--panel2)" : "var(--gold)",
                  color: resolving ? "var(--muted)" : "#030b18",
                  border: "none",
                  padding: "10px 16px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 900,
                  fontFamily: "var(--condensed)",
                  cursor: resolving ? "default" : "pointer",
                  flexShrink: 0,
                }}
              >
                {resolving ? "…" : t.traders_search_btn}
              </button>
            </div>
            {/* NIP-50 autocomplete dropdown */}
            {(loadingSuggestions || suggestions.length > 0) && (
              <div style={{
                background: "var(--panel)",
                border: "1px solid var(--line)",
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                overflow: "hidden",
              }}>
                {loadingSuggestions && suggestions.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)" }}>…</div>
                )}
                {suggestions.map(s => (
                  <div
                    key={s.pubkey}
                    onClick={() => selectSuggestion(s)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 12px", cursor: "pointer",
                      borderTop: "1px solid var(--line)",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(232,185,35,.07)"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}
                  >
                    {s.picture ? (
                      <img src={s.picture} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0 }}>👤</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", fontFamily: "var(--condensed)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.name || s.npub.slice(0, 16) + "…"}
                      </div>
                      {s.nip05 && (
                        <div style={{ fontSize: 10, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.nip05}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {searchError && (
            <div style={{ color: "#f87171", fontSize: 11, marginBottom: 8 }}>
              {searchError}
            </div>
          )}
          {resolving && (
            <div style={{ color: "var(--muted)", fontSize: 11 }}>{t.traders_resolving_nip05}</div>
          )}
          {searchLoading && !resolving && (
            <div style={{ color: "var(--muted)", fontSize: 11 }}>{t.traders_loading}</div>
          )}
        </div>
      )}

      {/* ── DESCUBRIR ── */}
      {subTab === "discover" && (
        <div>
          {!discoverEnabled && (
            <button
              onClick={() => setDiscoverEnabled(true)}
              style={{
                background: "var(--panel)",
                border: "1px solid var(--gold)",
                color: "var(--gold)",
                padding: "10px 18px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 900,
                fontFamily: "var(--condensed)",
                cursor: "pointer",
                letterSpacing: 0.5,
              }}
            >
              {t.traders_discover_btn}
            </button>
          )}
          {discoverLoading && (
            <div style={{ color: "var(--muted)", fontSize: 11 }}>{t.traders_loading}</div>
          )}
          {discoverEnabled && !discoverLoading && sortedTraders.length === 0 && (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{t.traders_empty}</div>
          )}
          {sortedTraders.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {sortedTraders.map((tr) => {
                const npub = nip19.npubEncode(tr.pubkey);
                const displayName =
                  tr.profile?.name || npub.slice(0, 16) + "…";
                const isSelected = selectedPubkey === tr.pubkey;
                return (
                  <div
                    key={tr.pubkey}
                    onClick={() =>
                      setSelectedPubkey(isSelected ? null : tr.pubkey)
                    }
                    style={{
                      background: isSelected ? "rgba(232,185,35,.08)" : "var(--panel)",
                      border: `1px solid ${isSelected ? "var(--gold)" : "var(--line)"}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <Avatar profile={tr.profile} displayName={displayName} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--condensed)",
                          fontWeight: 700,
                          fontSize: 13,
                          color: "var(--ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {displayName}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--muted)",
                          fontFamily: "var(--condensed)",
                        }}
                      >
                        {tr.score > 0
                          ? `↑${tr.theyOffer.length} ${t.traders_they_offer_short} · ↓${tr.iOffer.length} ${t.traders_i_offer_short}`
                          : t.traders_match_none}
                      </div>
                    </div>
                    {tr.score > 0 && (
                      <div
                        style={{
                          background: "rgba(82,183,136,.15)",
                          border: "1px solid rgba(82,183,136,.4)",
                          borderRadius: 6,
                          padding: "3px 8px",
                          fontSize: 10,
                          fontWeight: 900,
                          color: "#52b788",
                          fontFamily: "var(--condensed)",
                          flexShrink: 0,
                        }}
                      >
                        ×{tr.score}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Match panel ── */}
      {panelVisible && activeMatch && activeTrader && (
        <MatchPanel
          trader={activeTrader}
          match={activeMatch}
          copied={copied}
          onCopyNpub={copyNpub}
          t={t}
        />
      )}
    </div>
  );
}

// ─── Avatar circle ────────────────────────────────────────────────────────────
function Avatar({
  profile,
  displayName,
  size,
}: {
  profile: { name: string; picture: string } | null;
  displayName: string;
  size: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--panel2)",
        border: "1.5px solid var(--line)",
        overflow: "hidden",
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.38,
        fontWeight: 900,
        color: "var(--muted)",
        fontFamily: "var(--condensed)",
      }}
    >
      {profile?.picture ? (
        <img
          src={profile.picture}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        (displayName[0] ?? "?").toUpperCase()
      )}
    </div>
  );
}

// ─── Match panel ──────────────────────────────────────────────────────────────
function MatchPanel({
  trader,
  match,
  copied,
  onCopyNpub,
  t,
}: {
  trader: { pubkey: string; profile: { name: string; picture: string } | null };
  match: { iOffer: number[]; theyOffer: number[] };
  copied: boolean;
  onCopyNpub: (pubkey: string) => void;
  t: import("@/lib/i18n").Translations;
}) {
  const npub = nip19.npubEncode(trader.pubkey);
  const displayName = trader.profile?.name || npub.slice(0, 20) + "…";

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        overflow: "hidden",
        marginTop: 16,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel2)",
        }}
      >
        <Avatar profile={trader.profile} displayName={displayName} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 14,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              fontFamily: "var(--condensed)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {npub.slice(0, 24)}…
          </div>
        </div>
        <button
          onClick={() => onCopyNpub(trader.pubkey)}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            color: copied ? "var(--grass)" : "var(--muted)",
            padding: "6px 10px",
            borderRadius: 7,
            fontSize: 10,
            fontWeight: 900,
            fontFamily: "var(--condensed)",
            cursor: "pointer",
            flexShrink: 0,
            letterSpacing: 0.3,
          }}
        >
          {copied ? t.traders_copied : t.traders_copy_npub}
        </button>
      </div>

      {/* They offer you */}
      <StickerGroup
        label={t.traders_they_offer}
        nums={match.theyOffer}
        accent="#52b788"
        emptyLabel={t.traders_match_none}
        t={t}
      />

      {/* You offer them */}
      <StickerGroup
        label={t.traders_i_offer}
        nums={match.iOffer}
        accent="var(--gold)"
        emptyLabel={t.traders_match_none}
        t={t}
      />
    </div>
  );
}

// ─── Sticker group list ───────────────────────────────────────────────────────
function StickerGroup({
  label,
  nums,
  accent,
  emptyLabel,
}: {
  label: string;
  nums: number[];
  accent: string;
  emptyLabel: string;
  t: import("@/lib/i18n").Translations;
}) {
  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
      <div
        style={{
          fontFamily: "var(--condensed)",
          fontWeight: 900,
          fontSize: 10,
          letterSpacing: 1,
          color: accent,
          marginBottom: 8,
        }}
      >
        {label} ({nums.length})
      </div>
      {nums.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
          {emptyLabel}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {nums.map((n) => {
            const s = CATALOG[n];
            const r = RARITY_META[s.rarity];
            return (
              <div
                key={n}
                title={`#${n} ${s.name}`}
                style={{
                  background: "var(--panel2)",
                  border: `1px solid ${r.ring}`,
                  borderRadius: 5,
                  padding: "3px 7px",
                  fontSize: 10,
                  fontFamily: "var(--condensed)",
                  fontWeight: 700,
                  color: "var(--ink)",
                  whiteSpace: "nowrap",
                }}
              >
                #{n} {s.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
