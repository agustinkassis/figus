export type Lang = "es" | "en";

const T = {
  es: {
    // Nav tabs
    tab_album:   "ÁLBUM",
    tab_packs:   "SOBRES",
    tab_market:  "MERCADITO",
    tab_fixture: "FIXTURE",
    tab_game:    "⚽ JUGAR",

    // Header
    header_subtitle: "ÁLBUM NATIVO DE NOSTR + LIGHTNING",
    loading: "Cargando desde relays…",
    issuer_missing_title: "Falta configurar el issuer.",
    issuer_missing_body: 'Corré npm run seed para generar las claves y publicar el catálogo, copiá la pubkey impresa en .env como NEXT_PUBLIC_ISSUER_PUBKEY, y reiniciá el dev server.',

    // Progress bar
    collected: "PEGADAS",

    // Connect
    connect_ext:   "🔌 Conectar extensión",
    connect_local: "🔑 Clave nueva",
    logout:        "Salir",

    // Free pack
    pack_free_badge:    "🎁 BIENVENIDA",
    pack_free_title:    "Sobre de regalo",
    pack_free_subtitle: "Primera vez en Figus · 7 figuritas gratis · el claim queda guardado en Nostr",
    pack_free_btn:      "🎁 ABRIR REGALO",

    // Pack
    pack_classic:    "SOBRE CLÁSICO",
    pack_7random:    "7 FIGURITAS ALEATORIAS",
    pack_lightning:  "⚡ pago instantáneo vía Lightning",
    pack_open:       "⚡ ABRIR CON ZAP",
    pack_processing: "PROCESANDO…",
    pack_cancel:     "CANCELAR",
    pack_demo:       "MODO DEMO · sin pago",

    // Pack reveal
    pack_opened: "¡Sobre abierto!",
    pack_tap:    "TAP PARA CERRAR",
    pack_paste:  "✅ PEGAR EN EL ÁLBUM",

    // Invoice modal
    invoice_title:       "FACTURA LIGHTNING",
    invoice_subtitle:    "Escaneá el QR con tu wallet Lightning o copiá la factura",
    invoice_generating:  "Generando QR…",
    invoice_copy:        "📋 COPIAR FACTURA",
    invoice_copied:      "✅ COPIADO",
    invoice_nwc_btn:     "⚡ PAGAR CON NWC (Nostr Wallet Connect)",
    invoice_nwc_label:   "CADENA DE CONEXIÓN NWC",
    invoice_nwc_pay:     "⚡ PAGAR",
    invoice_nwc_sending: "ENVIANDO…",
    invoice_nwc_forget:  "OLVIDAR",
    invoice_nwc_hint:    "Encontrás tu cadena NWC en Alby Hub, Mutiny, Wallet of Satoshi u otras wallets compatibles.",

    // Album
    album_cover:    "PORTADA",
    album_group:    "GRP",
    album_prev:     "← ANTERIOR",
    album_next:     "SIGUIENTE →",
    album_hint:     "← → para navegar · click en esquina para voltear",
    album_prize:    "🏆 PREMIO",
    album_paste:    "PEGAR",
    album_page:     "pág.",
    album_of:       "de",
    album_stuck:    "pegadas",
    album_fwc_special: "★ FIGURAS ESPECIALES FWC ★",
    album_complete:    "FIGURAS PEGADAS",
    album_group_label: "GRUPO",

    // Cover
    cover_official:  "ÁLBUM OFICIAL",
    cover_album:     "ÁLBUM DE FIGURAS",
    cover_digital:   "NOSTR + LIGHTNING ⚡ EDICIÓN DIGITAL",

    // Market
    market_title:      "Mercadito P2P",
    market_subtitle:   "Comprá con un zap directo al vendedor. El issuer valida tenencia y transfiere la propiedad on-Nostr (settlement 1574).",
    market_your_dupes: "Tus repetidas para vender:",
    market_sell:       "vender",
    market_no_offers:  "No hay ofertas abiertas.",
    market_transfers:  "Transferencias confirmadas (1574)",
    market_view_listings: "COMPRAR/VENDER",
    market_view_traders:  "INTERCAMBIAR",

    // Traders / Trade
    traders_title:              "Intercambios (PROXIMAMENTE)",
    traders_subtitle:           "Buscá coleccionistas y encontrá tus matches de figuritas",
    traders_search_tab:         "BUSCAR",
    traders_discover_tab:       "DESCUBRIR",
    traders_search_placeholder: "npub1… o usuario@dominio.com (NIP-05)",
    traders_search_btn:         "BUSCAR",
    traders_discover_btn:       "⚡ BUSCAR COLECCIONISTAS",
    traders_loading:            "Buscando en relays…",
    traders_they_offer:         "ELLOS TE OFRECEN",
    traders_i_offer:            "VOS LES OFRECÉS",
    traders_they_offer_short:   "te ofrecen",
    traders_i_offer_short:      "vos ofrecés",
    traders_copy_npub:          "📋 COPIAR NPUB",
    traders_copied:             "✅ COPIADO",
    traders_invalid_npub:       "npub inválido — pegá un npub1…, pubkey hex o identificador NIP-05",
    traders_resolving_nip05:    "Resolviendo NIP-05…",
    traders_nip05_not_found:    "No se encontró ese NIP-05 — revisá que esté bien escrito",
    traders_match_none:         "Sin matches directos",
    traders_empty:              "No se encontraron coleccionistas en los relays",

    // My Stickers
    my_title:   "MIS FIGURITAS",
    my_unique:  "únicas",
    my_dupes:   "repetidas",
    my_tab_dupes: "REPETIDAS",
    my_tab_all:   "TODAS",
    my_sell:    "VENDER",
    my_empty_dupes: "Sin repetidas por ahora · ¡seguí abriendo sobres!",
    my_empty_all:   "Todavía no tenés figuritas",

    // Sticker zoom
    zoom_in_album: "En tu álbum",
    zoom_copies:   "copias",
    zoom_sell:     "🏷️ VENDER REPETIDA",
    zoom_close:    "CERRAR · ESC",

    // Fixture
    fixture_title:    "Fixture Completo",
    fixture_subtitle: "11 jun – 19 jul 2026 · USA 🇺🇸 · Canadá 🇨🇦 · México 🇲🇽 · 48 equipos",
    fixture_groups:   "FASE DE GRUPOS",
    fixture_knockout: "ELIMINATORIAS",
    fixture_group_tab:   "GRP",
    fixture_group_label: "GRUPO",
    fixture_teams_label: "EQUIPOS",
    fixture_venues:      "Sedes:",
    fixture_qualify: "Clasifican: Top 2 de cada grupo (24) + 8 mejores terceros = 32 equipos",
    fixture_format:  "Por primera vez 48 selecciones en 12 grupos de 4. Avanzan los 2 primeros de cada grupo + los 8 mejores terceros para completar una Ronda de 32. Todos los partidos eliminatorios son a partido único.",
    fixture_format_title: "Formato 2026:",
    matchday_1: "Jornada 1",
    matchday_2: "Jornada 2",
    matchday_3: "Jornada 3",

    // Rarity
    rarity_common:    "Común",
    rarity_rare:      "Rara",
    rarity_shiny:     "Brillante",
    rarity_legendary: "Legendaria",

    // Positions
    pos_fwc:    "FWC",
    pos_shield: "ESCUDO",
    pos_gk:     "POR",
    pos_def:    "DEF",
    pos_mid:    "MED",
    pos_squad:  "EQUIPO",
    pos_fwd:    "DEL",

    // Settings
    settings: "Configuración",

    // Footer
    footer: "NIP-57: zap a creador + P2P + zap split · estado en relays de Nostr · open source",
  },

  en: {
    // Nav tabs
    tab_album:   "ALBUM",
    tab_packs:   "PACKS",
    tab_market:  "MARKET",
    tab_fixture: "FIXTURE",
    tab_game:    "⚽ PLAY",

    // Header
    header_subtitle: "NATIVE NOSTR + LIGHTNING ALBUM",
    loading: "Loading from relays…",
    issuer_missing_title: "Issuer not configured.",
    issuer_missing_body: 'Run npm run seed to generate keys and publish the catalog, copy the printed pubkey to .env as NEXT_PUBLIC_ISSUER_PUBKEY, then restart the dev server.',

    // Progress bar
    collected: "COLLECTED",

    // Connect
    connect_ext:   "🔌 Connect extension",
    connect_local: "🔑 New key",
    logout:        "Log out",

    // Free pack
    pack_free_badge:    "🎁 WELCOME",
    pack_free_title:    "Free pack",
    pack_free_subtitle: "First time in Figus · 7 free stickers · claim is stored on Nostr",
    pack_free_btn:      "🎁 OPEN GIFT",

    // Pack
    pack_classic:    "CLASSIC PACK",
    pack_7random:    "7 RANDOM STICKERS",
    pack_lightning:  "⚡ instant payment via Lightning",
    pack_open:       "⚡ OPEN WITH ZAP",
    pack_processing: "PROCESSING…",
    pack_cancel:     "CANCEL",
    pack_demo:       "DEMO MODE · no payment",

    // Pack reveal
    pack_opened: "Pack opened!",
    pack_tap:    "TAP TO CLOSE",
    pack_paste:  "✅ ADD TO ALBUM",

    // Invoice modal
    invoice_title:       "LIGHTNING INVOICE",
    invoice_subtitle:    "Scan the QR with your Lightning wallet or copy the invoice",
    invoice_generating:  "Generating QR…",
    invoice_copy:        "📋 COPY INVOICE",
    invoice_copied:      "✅ COPIED",
    invoice_nwc_btn:     "⚡ PAY WITH NWC (Nostr Wallet Connect)",
    invoice_nwc_label:   "NWC CONNECTION STRING",
    invoice_nwc_pay:     "⚡ PAY",
    invoice_nwc_sending: "SENDING…",
    invoice_nwc_forget:  "FORGET",
    invoice_nwc_hint:    "Find your NWC string in Alby Hub, Mutiny, Wallet of Satoshi or other compatible wallets.",

    // Album
    album_cover:    "COVER",
    album_group:    "GRP",
    album_prev:     "← PREVIOUS",
    album_next:     "NEXT →",
    album_hint:     "← → to navigate · click corner to turn page",
    album_prize:    "🏆 PRIZE",
    album_paste:    "PASTE",
    album_page:     "pg.",
    album_of:       "of",
    album_stuck:    "collected",
    album_fwc_special: "★ FWC SPECIAL STICKERS ★",
    album_complete:    "STICKERS COLLECTED",
    album_group_label: "GROUP",

    // Cover
    cover_official:  "OFFICIAL ALBUM",
    cover_album:     "STICKER ALBUM",
    cover_digital:   "NOSTR + LIGHTNING ⚡ DIGITAL EDITION",

    // Market
    market_title:      "P2P Market",
    market_subtitle:   "Buy with a direct zap to the seller. The issuer validates ownership and transfers on-Nostr (settlement 1574).",
    market_your_dupes: "Your duplicates for sale:",
    market_sell:       "sell",
    market_no_offers:  "No open offers.",
    market_transfers:  "Confirmed transfers (1574)",
    market_view_listings: "BUY/SELL",
    market_view_traders:  "TRADE",

    // Traders / Trade
    traders_title:              "Trades",
    traders_subtitle:           "Find collectors and discover your sticker matches",
    traders_search_tab:         "SEARCH",
    traders_discover_tab:       "DISCOVER",
    traders_search_placeholder: "npub1… or user@domain.com (NIP-05)",
    traders_search_btn:         "SEARCH",
    traders_discover_btn:       "⚡ FIND COLLECTORS",
    traders_loading:            "Searching relays…",
    traders_they_offer:         "THEY OFFER YOU",
    traders_i_offer:            "YOU OFFER THEM",
    traders_they_offer_short:   "they offer",
    traders_i_offer_short:      "you offer",
    traders_copy_npub:          "📋 COPY NPUB",
    traders_copied:             "✅ COPIED",
    traders_invalid_npub:       "invalid npub — paste an npub1…, hex pubkey or NIP-05 identifier",
    traders_resolving_nip05:    "Resolving NIP-05…",
    traders_nip05_not_found:    "NIP-05 not found — check the identifier is correct",
    traders_match_none:         "No direct matches",
    traders_empty:              "No collectors found on relays",

    // My Stickers
    my_title:   "MY STICKERS",
    my_unique:  "unique",
    my_dupes:   "duplicates",
    my_tab_dupes: "DUPLICATES",
    my_tab_all:   "ALL",
    my_sell:    "SELL",
    my_empty_dupes: "No duplicates yet · keep opening packs!",
    my_empty_all:   "You don't have any stickers yet",

    // Sticker zoom
    zoom_in_album: "In your album",
    zoom_copies:   "copies",
    zoom_sell:     "🏷️ SELL DUPLICATE",
    zoom_close:    "CLOSE · ESC",

    // Fixture
    fixture_title:    "Full Fixture",
    fixture_subtitle: "Jun 11 – Jul 19 2026 · USA 🇺🇸 · Canada 🇨🇦 · Mexico 🇲🇽 · 48 teams",
    fixture_groups:   "GROUP STAGE",
    fixture_knockout: "KNOCKOUTS",
    fixture_group_tab:   "GRP",
    fixture_group_label: "GROUP",
    fixture_teams_label: "TEAMS",
    fixture_venues:      "Venues:",
    fixture_qualify: "Advance: Top 2 from each group (24) + 8 best third-placed = 32 teams",
    fixture_format:  "For the first time, 48 nations in 12 groups of 4. The top 2 from each group plus the 8 best third-placed teams advance to a Round of 32. All knockout matches are single-leg.",
    fixture_format_title: "2026 Format:",
    matchday_1: "Matchday 1",
    matchday_2: "Matchday 2",
    matchday_3: "Matchday 3",

    // Rarity
    rarity_common:    "Common",
    rarity_rare:      "Rare",
    rarity_shiny:     "Shiny",
    rarity_legendary: "Legendary",

    // Positions
    pos_fwc:    "FWC",
    pos_shield: "CREST",
    pos_gk:     "GK",
    pos_def:    "DEF",
    pos_mid:    "MID",
    pos_squad:  "SQUAD",
    pos_fwd:    "FWD",

    // Settings
    settings: "Settings",

    // Footer
    footer: "NIP-57: zap to creator + P2P + zap split · state on Nostr relays · open source",
  },
} as const;

export type TranslationKey = keyof typeof T.es;
export type Translations = typeof T.es;

export function getTranslations(lang: Lang): Translations {
  return T[lang] as Translations;
}
