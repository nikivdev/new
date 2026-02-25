// @ts-check
import risePlugin from "../../cli-ts/rules/effect.ts"

const ruleset = process.env.RISE_EFFECT_RULESET ?? "recommended"
const rules =
  risePlugin.configs?.[ruleset]?.rules ?? risePlugin.configs.recommended.rules

export default [
  {
    files: ["**/*.ts"],
    plugins: {
      rise: risePlugin,
    },
    rules,
  },
]
