# Figus — Proyecto Next.js

Cliente de Nostr para el álbum de figuritas del Mundial, con economía sobre Lightning (NIP-57). Conectado a relays reales.

## Requisitos

- Node.js 18+
- Una Lightning Address con soporte de zaps para el issuer (ej. una de Alby) si querés probar pagos reales.

## Puesta en marcha

```bash
npm install
cp .env.example .env
```

### 1. Generar las claves del issuer

```bash
npm run seed
```

La primera vez (sin `ISSUER_NSEC` en `.env`) imprime un par de claves nuevo. Copialo a `.env`:

```
ISSUER_NSEC=nsec1...
NEXT_PUBLIC_ISSUER_PUBKEY=<hex>
```

### 2. Publicar el catálogo

Volvé a correr el seed: ahora publica el álbum, las figuritas y el sobre en los relays.

```bash
npm run seed
```

### 3. Levantar el issuer (en otra terminal)

Escucha los zap receipts y emite grants / settlements / ownership.

```bash
npm run issuer
```

### 4. Levantar el cliente

```bash
npm run dev
# http://localhost:3000
```

## Estructura

```
src/
  app/
    page.tsx          # orquesta identidad, estado y acciones
    layout.tsx        # layout raíz + fuentes
    globals.css       # estilos y animaciones
  components/         # Album, Packs, Market, StickerCard, Connect
  hooks/
    useIdentity.ts    # NIP-07 + clave local
    useGameState.ts   # lee estado del juego desde relays
  lib/
    constants.ts      # kinds, relays, helpers
    types.ts          # tipos del dominio
    catalog.ts        # catálogo de figuritas, rarezas, sorteo
    pool.ts           # capa de relays (nostr-tools)
    parsers.ts        # eventos -> tipos del dominio
    identity.ts       # firmado (NIP-07 / local)
    zap.ts            # flujo NIP-57 (zap request -> invoice -> receipt)
issuer/
  index.ts            # listener de zap receipts (el "backend")
  seed.ts             # genera claves + publica catálogo
  lib.ts              # helpers del issuer
```

## Login

Dos métodos, ambos soportados:

- **NIP-07**: si tenés Alby / nos2x instalado, aparece "Conectar extensión".
- **Clave nueva**: genera una clave en el navegador (guardada en localStorage). Pensado para demo rápida.

> Para comprar en el mercadito con clave local, el vendedor necesita una Lightning Address publicada en su perfil (`lud16`).

## Notas de arquitectura

- **El estado vive en los relays.** No hay base de datos. La colección de un usuario se deriva de los eventos `30100` firmados por el issuer.
- **El issuer es trustless respecto del dinero.** Solo actúa ante un zap receipt `9735` válido. Nunca custodia fondos.
- Ver `docs/figus-modelo-datos-nostr.md` para los esquemas de todos los eventos.

## Pendientes / mejoras

- Cerrar el listing (`30200`) tras la venta también del lado del vendedor.
- Endpoint para que el cliente dispare el claim `1575` al issuer (hoy el claim queda señalizado en UI).
- Decode de LNURL bech32 además de Lightning Address.
- Tests del issuer.
# figus
