"use client";

import { useLeaderboard } from "@/hooks/useLeaderboard";
import { ALL_NUMBERS } from "@/lib/catalog";
import type { LeaderEntry } from "@/lib/types";

const TOTAL = ALL_NUMBERS.length;

const MEDAL = ["🥇", "🥈", "🥉"];

function shortPubkey(pk: string) {
  return pk.slice(0, 8) + "…" + pk.slice(-4);
}

function Avatar({ entry }: { entry: LeaderEntry }) {
  const name    = entry.profile?.name || shortPubkey(entry.pubkey);
  const picture = entry.profile?.picture;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {picture ? (
        <img
          src={picture}
          alt=""
          style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid var(--line)" }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          background: "var(--panel2)", border: "1.5px solid var(--line)",
          display: "grid", placeItems: "center",
          fontSize: 14, color: "var(--muted)", fontWeight: 900,
          fontFamily: "var(--condensed)",
        }}>
          {name[0]?.toUpperCase() || "?"}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontWeight: 900, fontSize: 13, color: "var(--ink)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontFamily: "var(--condensed)",
        }}>
          {name}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
          {entry.stickers}/{TOTAL} figus
        </div>
      </div>
    </div>
  );
}

export function Leaderboard({ myPubkey, onChallenge }: { myPubkey: string | null; onChallenge?: (pubkey: string) => void }) {
  const { entries, loading } = useLeaderboard(true);

  const myRank = myPubkey ? entries.findIndex(e => e.pubkey === myPubkey) : -1;

  return (
    <div style={{ fontFamily: "var(--condensed)" }}>

      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "var(--ink)", lineHeight: 1 }}>
          🏆 RANKING GLOBAL
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
          1 punto por figurita pegada en el álbum · actualizado en tiempo real desde Nostr
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: 24, fontSize: 13 }}>
          Leyendo relays…
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: 24, fontSize: 13 }}>
          Aún no hay coleccionistas registrados
        </div>
      )}

      {/* My rank callout */}
      {myRank >= 0 && (
        <div style={{
          background: "linear-gradient(135deg, rgba(232,185,35,.12), rgba(232,185,35,.05))",
          border: "1px solid var(--gold)",
          borderRadius: 10,
          padding: "10px 14px",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}>
          <div style={{ fontSize: 12, color: "var(--gold)", fontWeight: 900 }}>
            TU POSICIÓN
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "var(--gold)", lineHeight: 1 }}>
            #{myRank + 1}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {entries[myRank]?.score} pts
          </div>
        </div>
      )}

      {/* Podium (top 3) */}
      {entries.length >= 2 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "flex-end" }}>
          {[1, 0, 2].map(i => {
            const e = entries[i];
            if (!e) return null;
            const isFirst = i === 0;
            const name = e.profile?.name || shortPubkey(e.pubkey);
            return (
              <div key={e.pubkey} style={{
                flex: 1,
                background: isFirst
                  ? "linear-gradient(160deg, rgba(232,185,35,.18), rgba(232,185,35,.06))"
                  : "var(--panel)",
                border: `1px solid ${isFirst ? "var(--gold)" : "var(--line)"}`,
                borderRadius: 10,
                padding: "12px 8px 10px",
                textAlign: "center",
                order: i === 1 ? -1 : i === 2 ? 1 : 0,
              }}>
                <div style={{ fontSize: isFirst ? 28 : 22, lineHeight: 1 }}>{MEDAL[i]}</div>
                {e.profile?.picture && (
                  <img
                    src={e.profile.picture}
                    alt=""
                    style={{
                      width: isFirst ? 44 : 36, height: isFirst ? 44 : 36,
                      borderRadius: "50%", objectFit: "cover",
                      border: isFirst ? "2px solid var(--gold)" : "1.5px solid var(--line)",
                      margin: "6px auto 0", display: "block",
                    }}
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div style={{
                  fontSize: 11, fontWeight: 900, color: "var(--ink)",
                  marginTop: 6, lineHeight: 1.2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {name}
                </div>
                <div style={{ fontSize: 16, fontWeight: 900, color: isFirst ? "var(--gold)" : "var(--ink)", marginTop: 4 }}>
                  {e.score}
                  <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, marginLeft: 2 }}>pts</span>
                </div>
                {onChallenge && e.pubkey !== myPubkey && (
                  <button
                    onClick={() => onChallenge(e.pubkey)}
                    style={{
                      marginTop: 8, width: "100%",
                      background: "rgba(139,92,246,.15)",
                      border: "1px solid rgba(139,92,246,.4)",
                      color: "rgb(167,139,250)",
                      borderRadius: 6, padding: "4px 0",
                      fontSize: 9, fontWeight: 900,
                      fontFamily: "var(--condensed)", letterSpacing: 0.5,
                      cursor: "pointer",
                    }}
                  >
                    ⚽ DESAFIAR
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full list from 4th onwards (or all if < 3) */}
      <div style={{ display: "grid", gap: 6 }}>
        {entries.slice(entries.length >= 3 ? 3 : 0).map((e) => (
          <div
            key={e.pubkey}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: e.pubkey === myPubkey ? "rgba(232,185,35,.07)" : "var(--panel)",
              border: `1px solid ${e.pubkey === myPubkey ? "var(--gold)" : "var(--line)"}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{
              width: 28, flexShrink: 0, textAlign: "center",
              fontWeight: 900, fontSize: 14,
              color: e.rank <= 3 ? "var(--gold)" : "var(--muted)",
            }}>
              #{e.rank}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Avatar entry={e} />
            </div>
            <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: "var(--ink)", lineHeight: 1 }}>
                  {e.score}
                </div>
                <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: 0.5 }}>PTS</div>
              </div>
              {onChallenge && e.pubkey !== myPubkey && (
                <button
                  onClick={() => onChallenge(e.pubkey)}
                  style={{
                    background: "rgba(139,92,246,.15)",
                    border: "1px solid rgba(139,92,246,.4)",
                    color: "rgb(167,139,250)",
                    borderRadius: 6, padding: "4px 8px",
                    fontSize: 9, fontWeight: 900,
                    fontFamily: "var(--condensed)", letterSpacing: 0.5,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  ⚽ DESAFIAR
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {entries.length > 0 && (
        <div style={{ textAlign: "center", fontSize: 10, color: "var(--muted)", marginTop: 14 }}>
          {entries.length} coleccionistas · score = figuritas pegadas
        </div>
      )}
    </div>
  );
}
