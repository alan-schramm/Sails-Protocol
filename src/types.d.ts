/**
 * Ambient declarations for Holepunch/Pears packages that ship as plain
 * JS with no published .d.ts — hyperdht, hyperswarm, b4a are real,
 * current npm packages (confirmed via web search before writing this
 * code — see MASTER_COORDINATION.md). This file only silences
 * TypeScript's "implicit any" complaint; it does not change behavior.
 */
declare module 'hyperdht' {
  const DHT: any
  export default DHT
}
declare module 'hyperswarm' {
  const Hyperswarm: any
  export default Hyperswarm
}
declare module 'b4a' {
  const b4a: any
  export default b4a
}
