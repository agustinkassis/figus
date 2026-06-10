# Testing del issuer con issuer propio

Permite verificar los fixes de seguridad de punta a punta **sin sats reales**, usando un
relay local y el modo de pagos `mock` (las facturas se autoconfirman).

## 1. Generar un keypair de issuer de prueba

```bash
npm run seed          # imprime ISSUER_NSEC y NEXT_PUBLIC_ISSUER_PUBKEY
```

## 2. Crear `.env` (gitignored) apuntando al relay local + modo mock

```env
NEXT_PUBLIC_ALBUM_ID=mundial-2026
ISSUER_NSEC=nsec1...                 # del paso 1
NEXT_PUBLIC_ISSUER_PUBKEY=<hex>      # del paso 1
NEXT_PUBLIC_RELAYS=ws://localhost:7777
ISSUER_PAYMENTS=mock
ORDER_POLL_MS=2000
```

## 3. Levantar relay local + issuer (en dos terminales)

```bash
npm run relay         # relay Nostr en ws://localhost:7777 (rechaza firmas inválidas)
npm run issuer        # issuer en modo mock, escuchando órdenes
```

## 4. Correr los tests

```bash
npm run test:order    # camino feliz — debe conceder 7 figus
npm run test:forge    # exploit — debe quedar BLOQUEADO (PASS = no minteó)
```

### Qué prueba cada uno

| Script | Qué hace | Resultado esperado |
|--------|----------|--------------------|
| `test:order`  | Publica `ORDER_REQUEST`, recibe la factura del issuer, espera el `GRANT` tras el pago confirmado | ✅ 7 figus concedidas |
| `test:forge`  | Forja un `zap receipt` (kind 9735) con `figus-action: open-pack` para acuñar gratis | ✅ PASS = el issuer lo ignora, 0 figus |

## Testear con Lightning real (NWC)

En vez de `ISSUER_PAYMENTS=mock`, seteá `ISSUER_NWC=nostr+walletconnect://...` de una
wallet que soporte `make_invoice`/`lookup_invoice` (ej. Alby Hub). Quitá `ISSUER_PAYMENTS`.
El `test:order` mostrará una factura real que debés pagar; el issuer la confirma vía
`lookup_invoice` y recién ahí concede las figus.

## Verificación de firmas en lectura (Fix #3)

El relay de test (`issuer/test/relay.ts`) **rechaza eventos con firma inválida**, igual
que un relay honesto. Para probar el caso de relay malicioso, se puede modificar el relay
para aceptar firmas inválidas y confirmar que el cliente (`onlyFromIssuer`) las descarta.
