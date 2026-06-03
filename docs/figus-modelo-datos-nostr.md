# Figus — Modelo de datos sobre Nostr

> Álbum de figuritas del Mundial como cliente de Nostr, con economía sobre Lightning vía NIP-57.
> Hackatón #4 "ZAPS" — La Crypta Dev — Junio 2026.

---

## 0. Decisiones de diseño que sostienen el modelo

### 0.1 Propiedad de una figurita
Nostr no transfiere propiedad de eventos de forma nativa (cada quien firma con SU clave). Adoptamos el modelo **issuer-autoritativo**:

- Existe una única clave **ISSUER** (un servicio que corremos nosotros). Es la única autorizada a emitir y reasignar figuritas.
- La "verdad" sobre quién posee qué = el conjunto de eventos `ownership` (kind 30100) más recientes firmados por el ISSUER.
- El ISSUER **solo actúa al observar un zap receipt (9735) válido**. No puede inventar pagos ni robar: solo asigna lo que efectivamente se pagó. Esto lo hace trustless respecto del dinero, que es lo que importa.
- **Evolución futura (P2P puro):** cadena de custodia donde cada transferencia la firma el dueño saliente y se valida la cadena hacia atrás hasta el `mint` del issuer. Más elegante pero abre doble-gasto y complejidad de validación. Fuera de alcance para la hackathon; se menciona como roadmap.

### 0.2 Prueba de pago
La prueba canónica es el **zap receipt kind 9735** firmado por la `nostrPubkey` del LNURL server. El ISSUER se suscribe a esos receipts y reacciona. El cliente NUNCA asigna figus por su cuenta: solo refleja lo que el ISSUER firmó.

### 0.3 Relays
Definir 2-3 relays propios o públicos confiables. Todos los eventos de juego se publican ahí. Para la demo conviene un relay propio (ej. `nostr-rs-relay` o `strfry` local) para tener control y evitar ruido.

---

## 1. Tabla de kinds

| Kind | Nombre | Tipo Nostr | Firmante | Propósito |
|------|--------|-----------|----------|-----------|
| 9734 | Zap request | regular (no se publica) | usuario pagador | Solicitud de invoice al LNURL server |
| 9735 | Zap receipt | regular | LNURL server | Prueba de pago — dispara la lógica del ISSUER |
| 30050 | Album definition | addressable | ISSUER | Define un álbum (set de figuritas, páginas, rareza) |
| 30051 | Sticker template | addressable | ISSUER | Metadata de UNA figurita del set (nombre, equipo, imagen, rareza) |
| 30052 | Pack definition | addressable | ISSUER | Define un sobre/paquete: precio en sats, cantidad, pool de figus |
| 30100 | Ownership record | addressable | ISSUER | Estado vigente de propiedad de una figurita por un usuario |
| 1573  | Pack grant | regular | ISSUER | "Abriste el sobre X y te tocaron estas figus" (log auditable) |
| 30200 | Market listing | addressable | usuario vendedor | Oferta de venta P2P de una figurita repetida |
| 1574  | Trade settlement | regular | ISSUER | Confirmación de transferencia P2P tras zap entre usuarios |
| 1575  | Album claim | regular | ISSUER | Premio por completar página/álbum, con zap split |

> Los kinds custom (30050-30200, 1573-1575) son elecciones nuestras dentro de los rangos válidos: `30000-39999` = addressable (parametrizable replaceable, requieren tag `d`); `1000-9999` = regular (se almacenan). Documentar esto en el README es buen punto para el jurado.

---

## 2. Esquemas de eventos

### 2.1 Album definition — kind 30050 (ISSUER)

```json
{
  "kind": 30050,
  "pubkey": "<ISSUER_PUBKEY>",
  "created_at": 1717200000,
  "tags": [
    ["d", "mundial-2026"],
    ["title", "Álbum Mundial 2026"],
    ["total", "640"],
    ["page", "arg", "Argentina", "1"],
    ["page", "bra", "Brasil", "2"],
    ["relays", "wss://relay.figus.ar", "wss://relay.lacrypta.ar"]
  ],
  "content": "{\"description\":\"Álbum oficial Figus Mundial 2026\",\"cover\":\"https://...\"}",
  "sig": "..."
}
```

### 2.2 Sticker template — kind 30051 (ISSUER)

Una figurita del catálogo (la plantilla, no la posesión).

```json
{
  "kind": 30051,
  "pubkey": "<ISSUER_PUBKEY>",
  "created_at": 1717200000,
  "tags": [
    ["d", "mundial-2026:10"],
    ["a", "30050:<ISSUER_PUBKEY>:mundial-2026"],
    ["number", "10"],
    ["name", "Lionel Messi"],
    ["team", "arg"],
    ["page", "arg"],
    ["rarity", "shiny"],
    ["image", "https://blossom-or-cdn/figu-10.webp"]
  ],
  "content": "",
  "sig": "..."
}
```

`rarity` ∈ `common | rare | shiny | legendary`. La rareza define probabilidad de drop y/o que solo salga en packs premium.

### 2.3 Pack definition — kind 30052 (ISSUER)

```json
{
  "kind": 30052,
  "pubkey": "<ISSUER_PUBKEY>",
  "created_at": 1717200000,
  "tags": [
    ["d", "pack-basico"],
    ["a", "30050:<ISSUER_PUBKEY>:mundial-2026"],
    ["title", "Sobre clásico"],
    ["price", "500"],
    ["count", "5"],
    ["zap", "<ISSUER_PUBKEY>", "wss://relay.figus.ar", "1"]
  ],
  "content": "{\"odds\":{\"common\":0.8,\"rare\":0.17,\"shiny\":0.029,\"legendary\":0.001}}",
  "sig": "..."
}
```

- `price` en sats (500). El tag `zap` sigue el formato NIP-57 Appendix G: `["zap", <pubkey>, <relay>, <weight>]`. Acá apunta al ISSUER porque el pago de un sobre va al pozo del juego.
- `count` = cuántas figus entrega el sobre.

### 2.4 Flujo "abrir sobre" — zap request 9734 → receipt 9735 → grant 1573

**Paso 1.** El cliente arma el zap request (no se publica, se manda al callback LNURL del ISSUER):

```json
{
  "kind": 9734,
  "pubkey": "<USER_PUBKEY>",
  "created_at": 1717201000,
  "tags": [
    ["relays", "wss://relay.figus.ar"],
    ["amount", "500000"],
    ["lnurl", "lnurl1..."],
    ["p", "<ISSUER_PUBKEY>"],
    ["a", "30052:<ISSUER_PUBKEY>:pack-basico"],
    ["figus-action", "open-pack"]
  ],
  "content": "Abriendo sobre clásico",
  "sig": "..."
}
```

- `amount` en **millisats** (500 sats = 500000 msat).
- Tags custom `["figus-action","open-pack"]` y el `a` del pack le dicen al ISSUER qué hacer cuando vea el receipt. Van DENTRO del zap request, que queda embebido en el campo `description` del receipt, así que el ISSUER los puede leer de forma confiable.

**Paso 2.** El LNURL server emite el invoice; al pagarse, publica el **zap receipt 9735** (firmado por la clave del LNURL server). El `description` contiene el 9734 completo.

**Paso 3.** El ISSUER (suscrito a 9735 con `#p = ISSUER_PUBKEY`) valida el receipt, lee `figus-action: open-pack`, sortea figus según `odds`, y publica:

```json
{
  "kind": 1573,
  "pubkey": "<ISSUER_PUBKEY>",
  "created_at": 1717201100,
  "tags": [
    ["p", "<USER_PUBKEY>"],
    ["e", "<id_del_zap_receipt_9735>"],
    ["a", "30052:<ISSUER_PUBKEY>:pack-basico"],
    ["sticker", "mundial-2026:10"],
    ["sticker", "mundial-2026:42"],
    ["sticker", "mundial-2026:103"],
    ["sticker", "mundial-2026:201"],
    ["sticker", "mundial-2026:355"]
  ],
  "content": "",
  "sig": "..."
}
```

- El tag `e` referencia el receipt: **link auditable pago → figus**. Cualquiera puede verificar que ese grant corresponde a un pago real.

**Paso 4.** El ISSUER actualiza/crea el ownership de cada figu (sección 2.5).

### 2.5 Ownership record — kind 30100 (ISSUER)

Estado vigente de cuántas copias de la figu N tiene el usuario U. Addressable → el `d` único hace que se reemplace, manteniendo siempre el último estado.

```json
{
  "kind": 30100,
  "pubkey": "<ISSUER_PUBKEY>",
  "created_at": 1717201100,
  "tags": [
    ["d", "<USER_PUBKEY>:mundial-2026:10"],
    ["p", "<USER_PUBKEY>"],
    ["sticker", "mundial-2026:10"],
    ["a", "30051:<ISSUER_PUBKEY>:mundial-2026:10"],
    ["count", "2"],
    ["pasted", "true"]
  ],
  "content": "",
  "sig": "..."
}
```

- `count` = copias totales (2 = una pegada + una repetida disponible para vender).
- `pasted` = si la pegó en el álbum. "Pegar" es solo un flag de UX; no cambia la propiedad.
- Para leer la colección de un usuario, el cliente hace `REQ` con `{ kinds:[30100], authors:[ISSUER], "#p":[USER_PUBKEY] }`.

### 2.6 Mercadito P2P — listing 30200 → zap → settlement 1574

**Paso 1.** El vendedor (dueño de una repetida) publica una oferta. Esto SÍ lo firma el usuario, no el ISSUER:

```json
{
  "kind": 30200,
  "pubkey": "<SELLER_PUBKEY>",
  "created_at": 1717202000,
  "tags": [
    ["d", "sell:mundial-2026:10:1717202000"],
    ["sticker", "mundial-2026:10"],
    ["a", "30051:<ISSUER_PUBKEY>:mundial-2026:10"],
    ["price", "300"],
    ["status", "open"],
    ["p", "<ISSUER_PUBKEY>"]
  ],
  "content": "Vendo Messi repetida, 300 sats",
  "sig": "..."
}
```

**Paso 2.** El comprador zapea al **vendedor** referenciando la oferta. Zap request:

```json
{
  "kind": 9734,
  "pubkey": "<BUYER_PUBKEY>",
  "created_at": 1717202100,
  "tags": [
    ["relays", "wss://relay.figus.ar"],
    ["amount", "300000"],
    ["lnurl", "lnurl1..."],
    ["p", "<SELLER_PUBKEY>"],
    ["a", "30200:<SELLER_PUBKEY>:sell:mundial-2026:10:1717202000"],
    ["figus-action", "buy-sticker"]
  ],
  "content": "Te compro la Messi",
  "sig": "..."
}
```

- El dinero va al vendedor (zap P2P real entre usuarios). El tag `a` referencia el listing.

**Paso 3.** El ISSUER ve el receipt 9735 dirigido al vendedor que contiene `figus-action: buy-sticker`. Valida que:
1. el listing exista y esté `open`,
2. el vendedor efectivamente tenga `count >= 1` de esa figu,
3. el `amount` cubra el `price`.

Si todo OK, publica el **settlement** y actualiza los dos ownership (resta 1 al vendedor, suma 1 al comprador), y marca el listing como vendido:

```json
{
  "kind": 1574,
  "pubkey": "<ISSUER_PUBKEY>",
  "created_at": 1717202200,
  "tags": [
    ["e", "<id_zap_receipt_9735>"],
    ["a", "30200:<SELLER_PUBKEY>:sell:mundial-2026:10:1717202000"],
    ["sticker", "mundial-2026:10"],
    ["from", "<SELLER_PUBKEY>"],
    ["to", "<BUYER_PUBKEY>"],
    ["price", "300"]
  ],
  "content": "",
  "sig": "..."
}
```

> **Nota de seguridad clave para el pitch:** como el ISSUER valida tenencia y estado del listing ANTES de transferir, no hay doble venta ni venta de figus que no tenés. El vendedor no puede estafar; el comprador no puede recibir sin pagar. El issuer no toca el dinero (va directo vendedor↔comprador por Lightning); solo arbitra la propiedad on-Nostr.

### 2.7 Completar álbum — claim 1575 con zap split (ISSUER)

Cuando el cliente detecta que el usuario tiene los 30100 que cubren una página (o el álbum completo), habilita el botón "Reclamar premio". El reclamo dispara que el ISSUER emita un zap split desde el pozo.

El **zap split** usa el formato NIP-57 Appendix G: múltiples tags `zap` con pesos. El pozo reparte así, por ejemplo, 1000 sats:

```json
{
  "kind": 1575,
  "pubkey": "<ISSUER_PUBKEY>",
  "created_at": 1717203000,
  "tags": [
    ["p", "<USER_PUBKEY>"],
    ["a", "30050:<ISSUER_PUBKEY>:mundial-2026"],
    ["scope", "page", "arg"],
    ["reward", "1000"],
    ["zap", "<USER_PUBKEY>",      "wss://relay.figus.ar", "70"],
    ["zap", "<ALBUM_CREATOR_PK>", "wss://relay.figus.ar", "20"],
    ["zap", "<COMMUNITY_PK>",     "wss://relay.figus.ar", "10"]
  ],
  "content": "¡Página Argentina completa! Premio repartido.",
  "sig": "..."
}
```

- Pesos 70/20/10 → el jugador recibe el 70% del premio, el creador del álbum 20%, la comunidad 10%. El cliente que procese este claim genera los zaps correspondientes a cada destinatario según el peso (es exactamente el mecanismo de zap split que usan los clientes para repartir un zap entre varios pubkeys).
- `scope` puede ser `page <id>` o `album` (premio mayor por completar todo).

---

## 3. Consultas (REQ) que necesita el cliente

| Objetivo | Filtro |
|----------|--------|
| Cargar catálogo del álbum | `{ kinds:[30050,30051], authors:[ISSUER] }` |
| Packs disponibles | `{ kinds:[30052], authors:[ISSUER] }` |
| Mi colección | `{ kinds:[30100], authors:[ISSUER], "#p":[ME] }` |
| Mis aperturas de sobres (historial) | `{ kinds:[1573], authors:[ISSUER], "#p":[ME] }` |
| Ofertas del mercadito | `{ kinds:[30200], "#status":["open"] }` (filtrar abiertas en cliente) |
| Settlements de una oferta | `{ kinds:[1574], "#a":["30200:...:..."] }` |
| Mis premios reclamados | `{ kinds:[1575], authors:[ISSUER], "#p":[ME] }` |

---

## 4. Responsabilidades del servicio ISSUER (mínimo viable)

1. Mantener un par de claves (la clave autoritativa del juego).
2. Suscribirse a `{ kinds:[9735] }` en los relays del juego (zap receipts).
3. Por cada receipt válido, decodificar el 9734 embebido (`description`), leer `figus-action`:
   - `open-pack` → sortear figus, publicar 1573 + actualizar 30100.
   - `buy-sticker` → validar listing + tenencia, publicar 1574 + actualizar los dos 30100 + cerrar 30200.
4. Endpoint o listener para reclamos de álbum completo → publicar 1575 con zap split y ejecutar los zaps de premio.
5. (LNURL) Tener una Lightning Address / LNURL server que soporte zaps (allowsNostr=true, nostrPubkey). Para la demo se puede usar un proveedor existente (Alby, LNbits con extensión, etc.) sin construir el server desde cero.

> Para la demo en vivo, el ISSUER puede correr como un pequeño proceso Node/TS que escucha receipts. No requiere base de datos: el estado vive en los relays (los 30100).

---

## 5. Roadmap post-hackathon (mencionar, no construir)
- Custodia P2P pura (transferencias firmadas por el dueño saliente, validación de cadena).
- Assets de figuritas en Blossom en lugar de CDN.
- Integración con LaWallet como wallet por defecto.
- Figus "animadas" / NIP-XX para video.
- Mercado de subastas (oferta más alta gana) en vez de precio fijo.
