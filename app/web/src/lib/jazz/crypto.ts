import { PureJSCrypto } from "cojson/crypto/PureJSCrypto"
import { WasmCrypto } from "cojson/crypto/WasmCrypto"

let configured = false

export const isProdRuntime = () => {
  const metaEnv =
    typeof import.meta !== "undefined"
      ? (import.meta as { env?: { PROD?: boolean } }).env
      : undefined
  if (typeof metaEnv?.PROD === "boolean") {
    return metaEnv.PROD
  }
  if (typeof process !== "undefined") {
    return process.env.NODE_ENV === "production"
  }
  return false
}

export const disableWasmCryptoInDev = () => {
  if (configured) return
  configured = true

  if (isProdRuntime()) return

  const wasmCrypto = WasmCrypto as unknown as {
    create: typeof PureJSCrypto.create
  }
  wasmCrypto.create = PureJSCrypto.create
}
