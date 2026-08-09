--[[
  HyperDHT / dht-rpc Wireshark dissector — Sails Protocol engineering tool

  Standalone Lua plugin, isolated from the Sails Protocol codebase (src/,
  packages/) and from anything shipped to production. Purely a developer
  debugging aid for the Pears/HyperDHT transport layer this project's
  TransportProvider (src/infrastructure/p2p/transport-provider.ts) sits on
  top of. Never installed with the product; a developer opts in by copying
  it into their own Wireshark plugins folder (see README.md next to this
  file).

  Built by reading holepunchto's own real source (not guessed, not from a
  third-party dissector — none exists publicly as of 2026-08-08, confirmed
  before writing this):
    - holepunchto/dht-rpc  lib/io.js         — the base request/response envelope
    - holepunchto/hyperdht lib/constants.js  — the 11 command IDs
    - holepunchto/hyperdht lib/messages.js   — per-command payload schemas
    - holepunchto/compact-encoding index.js  — the uint/buffer/array/fixed
      primitive wire formats every field above is built from

  Scope and honesty about limits:
  - This is a v1, built from source reading, NOT validated against a live
    two-node HyperDHT capture (this dev environment has no live P2P network
    to capture against — the same disclosed limitation transport-provider.ts's
    own tests already carry for PearsTransportProvider). Treat field
    decodes as "should be correct per the source", not "verified against
    real bytes on the wire" until someone runs it against a real capture.
  - The `noise` field inside a PEER_HANDSHAKE payload is the opaque Noise_XX
    handshake blob itself — this dissector shows it as raw bytes and does
    NOT attempt to decrypt or interpret it. Nothing about Hyperswarm's
    connection-level encryption is broken or bypassed by this tool; only
    the plaintext DHT routing/discovery envelope (which must be readable by
    any DHT participant to function as a Kademlia DHT at all — the same
    trust model BitTorrent's mainline DHT uses) is decoded.
  - Registered as a heuristic UDP dissector (checks the header byte for a
    valid dht-rpc version/type nibble before claiming a packet) rather than
    bound to a fixed port, since HyperDHT nodes use ephemeral UDP ports;
    the 3 known bootstrap nodes (node1-3.hyperdht.org) use port 49737 if a
    fixed "Decode As" port is preferred instead.
]]

local hyperdht_proto = Proto("hyperdht", "HyperDHT / dht-rpc")

-- ─── dht-rpc envelope fields (lib/io.js) ──────────────────────────────────
local f_header      = ProtoField.uint8("hyperdht.header", "Header", base.HEX)
local f_type        = ProtoField.uint8("hyperdht.type", "Type", base.DEC, { [0] = "REQUEST", [1] = "RESPONSE" }, 0xF0)
local f_version     = ProtoField.uint8("hyperdht.version", "Version", base.DEC, nil, 0x03)
local f_flags       = ProtoField.uint8("hyperdht.flags", "Flags", base.HEX)
local f_flag_id     = ProtoField.bool("hyperdht.flags.id", "ID present", 8, nil, 0x01)
local f_flag_token  = ProtoField.bool("hyperdht.flags.token", "Token present", 8, nil, 0x02)
local f_flag_internal = ProtoField.bool("hyperdht.flags.internal", "Internal command", 8, nil, 0x04)
local f_flag_target = ProtoField.bool("hyperdht.flags.target", "Target present", 8, nil, 0x08)
local f_flag_value_req = ProtoField.bool("hyperdht.flags.value", "Value present", 8, nil, 0x10)
local f_flag_closer = ProtoField.bool("hyperdht.flags.closernodes", "Closer nodes present", 8, nil, 0x04)
local f_flag_error_p = ProtoField.bool("hyperdht.flags.error", "Error present", 8, nil, 0x08)
local f_flag_value_res = ProtoField.bool("hyperdht.flags.value", "Value present", 8, nil, 0x10)
local f_tid         = ProtoField.uint16("hyperdht.tid", "Transaction ID", base.DEC_HEX)
local f_addr_ip     = ProtoField.ipv4("hyperdht.addr.ip", "Address IP")
local f_addr_port   = ProtoField.uint16("hyperdht.addr.port", "Address Port", base.DEC)
local f_id          = ProtoField.bytes("hyperdht.id", "Node ID (fixed32)")
local f_token       = ProtoField.bytes("hyperdht.token", "Token (fixed32)")
local f_command     = ProtoField.uint32("hyperdht.command", "Command", base.DEC)
local f_target      = ProtoField.bytes("hyperdht.target", "DHT target (fixed32)")
local f_value       = ProtoField.bytes("hyperdht.value", "Value payload")
local f_value_len   = ProtoField.uint32("hyperdht.value_len", "Value length (varint)", base.DEC)
local f_error       = ProtoField.uint32("hyperdht.error", "Error code", base.DEC)
local f_closernodes_count = ProtoField.uint32("hyperdht.closernodes.count", "Closer nodes count", base.DEC)
local f_closernode_ip   = ProtoField.ipv4("hyperdht.closernodes.ip", "Closer node IP")
local f_closernode_port = ProtoField.uint16("hyperdht.closernodes.port", "Closer node port", base.DEC)

-- ─── HyperDHT-specific value-payload fields (lib/messages.js), best-effort ──
local f_hs_flags     = ProtoField.uint32("hyperdht.handshake.flags", "Handshake flags", base.HEX)
local f_hs_mode      = ProtoField.uint32("hyperdht.handshake.mode", "Handshake mode", base.DEC)
local f_hs_noise_len = ProtoField.uint32("hyperdht.handshake.noise_len", "Noise payload length", base.DEC)
local f_hs_noise     = ProtoField.bytes("hyperdht.handshake.noise", "Noise handshake blob (opaque, not decrypted)")
local f_ann_flags    = ProtoField.uint32("hyperdht.announce.flags", "Announce flags", base.HEX)
local f_ann_pubkey   = ProtoField.bytes("hyperdht.announce.peer_pubkey", "Peer public key (fixed32)")
local f_mut_pubkey   = ProtoField.bytes("hyperdht.mutable.public_key", "Public key (fixed32)")
local f_mut_seq      = ProtoField.uint32("hyperdht.mutable.seq", "Sequence", base.DEC)
local f_lookup_peer_count = ProtoField.uint32("hyperdht.lookup.peer_count", "Peer count", base.DEC)

hyperdht_proto.fields = {
  f_header, f_type, f_version, f_flags,
  f_flag_id, f_flag_token, f_flag_internal, f_flag_target, f_flag_value_req,
  f_flag_closer, f_flag_error_p, f_flag_value_res,
  f_tid, f_addr_ip, f_addr_port, f_id, f_token, f_command, f_target,
  f_value, f_value_len, f_error, f_closernodes_count, f_closernode_ip, f_closernode_port,
  f_hs_flags, f_hs_mode, f_hs_noise_len, f_hs_noise,
  f_ann_flags, f_ann_pubkey, f_mut_pubkey, f_mut_seq, f_lookup_peer_count,
}

-- lib/constants.js COMMANDS — verbatim
local COMMAND_NAMES = {
  [0] = "PEER_HANDSHAKE",
  [1] = "PEER_HOLEPUNCH",
  [2] = "FIND_PEER",
  [3] = "LOOKUP",
  [4] = "ANNOUNCE",
  [5] = "UNANNOUNCE",
  [6] = "MUTABLE_PUT",
  [7] = "MUTABLE_GET",
  [8] = "IMMUTABLE_PUT",
  [9] = "IMMUTABLE_GET",
  [10] = "PLUGIN",
}

local REQUEST_HEADER = 0x0B  -- (0b0000 << 4) | 0b11
local RESPONSE_HEADER = 0x1B -- (0b0001 << 4) | 0b11

-- compact-encoding's `uint` varint (CompactSize, little-endian) — returns
-- decoded value + number of bytes consumed. `buf`/`offset` are 0-based
-- TvbRange-relative.
local function read_uint(buf, offset)
  local first = buf(offset, 1):uint()
  if first <= 0xfc then
    return first, 1
  elseif first == 0xfd then
    return buf(offset + 1, 2):le_uint(), 3
  elseif first == 0xfe then
    return buf(offset + 1, 4):le_uint(), 5
  else
    return buf(offset + 1, 8):le_uint64(), 9
  end
end

-- compact-encoding's `buffer`: uint-varint length prefix + raw bytes.
local function read_buffer_len(buf, offset)
  local len, consumed = read_uint(buf, offset)
  return len, consumed
end

-- peer.ipv4 (io.js): 4-byte IP + 2-byte port, 6 bytes total.
local function add_ipv4_field(tree, buf, offset, ip_field, port_field, label)
  local sub = tree:add(hyperdht_proto, buf(offset, 6), label or "Address")
  sub:add(ip_field, buf(offset, 4))
  sub:add(port_field, buf(offset + 4, 2))
  return offset + 6
end

-- Best-effort decode of the HyperDHT-specific `value` buffer for the
-- commands whose messages.js schema is a simple, non-recursive structure.
-- Anything else (PEER_HOLEPUNCH's holepunchPayload, PLUGIN's pluginRequest,
-- IMMUTABLE_*'s bare buffer) is intentionally left as raw bytes in this v1
-- rather than guessed at — see this file's own header comment on scope.
local function dissect_value(tree, buf, offset, len, command, is_request)
  if len == 0 then return end
  local value_buf = buf(offset, len)

  if command == 0 and is_request then
    -- exports.handshake: flags(uint) + mode(uint) + noise(buffer) + optional peerAddress/relayAddress
    local sub = tree:add(hyperdht_proto, value_buf, "PEER_HANDSHAKE payload")
    local pos = 0
    local flags, n = read_uint(value_buf, pos); pos = pos + n
    sub:add(f_hs_flags, value_buf(0, n), flags)
    local mode, n2 = read_uint(value_buf, pos); pos = pos + n2
    sub:add(f_hs_mode, value_buf(pos - n2, n2), mode)
    local noise_len, n3 = read_buffer_len(value_buf, pos); pos = pos + n3
    sub:add(f_hs_noise_len, value_buf(pos - n3, n3), noise_len)
    if pos + noise_len <= len then
      sub:add(f_hs_noise, value_buf(pos, noise_len))
    end
    return
  end

  if command == 4 and is_request then
    -- exports.announce: flags(uint) + optional peer{pubkey(fixed32), relayAddresses} + refresh/signature/bump
    local sub = tree:add(hyperdht_proto, value_buf, "ANNOUNCE payload")
    local pos = 0
    local flags, n = read_uint(value_buf, pos); pos = pos + n
    sub:add(f_ann_flags, value_buf(0, n), flags)
    if bit.band(flags, 0x01) ~= 0 and pos + 32 <= len then
      sub:add(f_ann_pubkey, value_buf(pos, 32))
      pos = pos + 32
      -- relayAddresses (ipv4Array) follows but is variable-length and
      -- skipped in this v1 — flagged, not silently claimed as decoded.
    end
    return
  end

  if (command == 6 or command == 8) and is_request then
    -- exports.mutablePutRequest / immutable put's own simpler shape share
    -- the publicKey+seq+value+signature prefix closely enough to label
    -- the fixed leading fields usefully without over-claiming precision.
    local sub = tree:add(hyperdht_proto, value_buf, "MUTABLE/IMMUTABLE PUT payload (partial decode)")
    if len >= 32 then
      sub:add(f_mut_pubkey, value_buf(0, 32))
    end
    return
  end

  if command == 7 and not is_request then
    -- exports.mutableGetResponse: seq(uint) + value(buffer) + signature(fixed64)
    local sub = tree:add(hyperdht_proto, value_buf, "MUTABLE_GET response payload")
    local pos = 0
    local seq, n = read_uint(value_buf, pos); pos = pos + n
    sub:add(f_mut_seq, value_buf(0, n), seq)
    return
  end

  if command == 3 and not is_request then
    -- exports.lookupRawReply: array<peer>(raw) + bump(uint). Each peer is
    -- publicKey(fixed32) + relayAddresses(ipv4Array) — variable length, so
    -- only the leading count is decoded with confidence in this v1.
    local sub = tree:add(hyperdht_proto, value_buf, "LOOKUP reply payload")
    local count, n = read_uint(value_buf, 0)
    sub:add(f_lookup_peer_count, value_buf(0, n), count)
    return
  end

  -- Fallback — every other command's value payload, or a shape this file
  -- doesn't attempt (see comment above dissect_value). Shown as raw bytes,
  -- not mis-labeled as something more specific than that.
  tree:add(hyperdht_proto, value_buf, "Value payload (undecoded in this v1 — raw bytes)")
end

function hyperdht_proto.dissector(buf, pinfo, tree)
  if buf:len() < 2 then return 0 end

  local header = buf(0, 1):uint()

  if header ~= REQUEST_HEADER and header ~= RESPONSE_HEADER then
    return 0 -- not a recognizable dht-rpc packet — let other dissectors try
  end

  pinfo.cols.protocol = "HyperDHT"

  local subtree = tree:add(hyperdht_proto, buf(), "HyperDHT / dht-rpc")
  subtree:add(f_header, buf(0, 1))
  subtree:add(f_type, buf(0, 1))
  subtree:add(f_version, buf(0, 1))

  local is_request = (header == REQUEST_HEADER)

  local flags = buf(1, 1):uint()
  local flags_tree = subtree:add(f_flags, buf(1, 1))
  if is_request then
    flags_tree:add(f_flag_id, buf(1, 1))
    flags_tree:add(f_flag_token, buf(1, 1))
    flags_tree:add(f_flag_internal, buf(1, 1))
    flags_tree:add(f_flag_target, buf(1, 1))
    flags_tree:add(f_flag_value_req, buf(1, 1))
  else
    flags_tree:add(f_flag_id, buf(1, 1))
    flags_tree:add(f_flag_token, buf(1, 1))
    flags_tree:add(f_flag_closer, buf(1, 1))
    flags_tree:add(f_flag_error_p, buf(1, 1))
    flags_tree:add(f_flag_value_res, buf(1, 1))
  end

  local offset = 2
  if buf:len() < offset + 2 then return offset end
  subtree:add_le(f_tid, buf(offset, 2)); offset = offset + 2

  if buf:len() < offset + 6 then return offset end
  offset = add_ipv4_field(subtree, buf, offset, f_addr_ip, f_addr_port, is_request and "To (destination)" or "From (source)")

  if bit.band(flags, 0x01) ~= 0 then
    if buf:len() < offset + 32 then return offset end
    subtree:add(f_id, buf(offset, 32)); offset = offset + 32
  end

  if bit.band(flags, 0x02) ~= 0 then
    if buf:len() < offset + 32 then return offset end
    subtree:add(f_token, buf(offset, 32)); offset = offset + 32
  end

  local command = nil

  if is_request then
    local cmd, n = read_uint(buf, offset)
    command = cmd
    subtree:add(f_command, buf(offset, n), cmd)
    local cmd_name = COMMAND_NAMES[cmd] or "unknown"
    pinfo.cols.info = string.format("REQUEST %s (%d) tid=%d", cmd_name, cmd, buf(2, 2):le_uint())
    offset = offset + n

    if bit.band(flags, 0x08) ~= 0 then
      if buf:len() < offset + 32 then return offset end
      subtree:add(f_target, buf(offset, 32)); offset = offset + 32
    end

    if bit.band(flags, 0x10) ~= 0 then
      local len, n2 = read_buffer_len(buf, offset)
      subtree:add(f_value_len, buf(offset, n2), len)
      offset = offset + n2
      if buf:len() < offset + len then return offset end
      subtree:add(f_value, buf(offset, len))
      dissect_value(subtree, buf, offset, len, command, true)
      offset = offset + len
    end
  else
    pinfo.cols.info = string.format("RESPONSE tid=%d", buf(2, 2):le_uint())

    if bit.band(flags, 0x04) ~= 0 then
      local count, n = read_uint(buf, offset)
      subtree:add(f_closernodes_count, buf(offset, n), count)
      offset = offset + n
      for i = 1, count do
        if buf:len() < offset + 6 then break end
        offset = add_ipv4_field(subtree, buf, offset, f_closernode_ip, f_closernode_port, "Closer node " .. i)
      end
    end

    if bit.band(flags, 0x08) ~= 0 then
      local err, n = read_uint(buf, offset)
      subtree:add(f_error, buf(offset, n), err)
      offset = offset + n
    end

    if bit.band(flags, 0x10) ~= 0 then
      local len, n2 = read_buffer_len(buf, offset)
      subtree:add(f_value_len, buf(offset, n2), len)
      offset = offset + n2
      if buf:len() < offset + len then return offset end
      subtree:add(f_value, buf(offset, len))
      -- Note: the response path doesn't carry `command` (dht-rpc's own
      -- response envelope has no command field — the requester correlates
      -- by `tid` against its own outstanding request, per io.js). Value
      -- payload decoding for responses that need to know which command
      -- they're replying to (e.g. LOOKUP/MUTABLE_GET) is therefore
      -- necessarily best-effort without tid-based request/response
      -- correlation, which this v1 does not implement.
      offset = offset + len
    end
  end

  return offset
end

-- Heuristic registration: only claims a UDP packet whose first byte is
-- exactly REQUEST_HEADER or RESPONSE_HEADER — avoids false-positively
-- claiming arbitrary UDP traffic on the capture.
local function heuristic_checker(buf, pinfo, tree)
  if buf:len() < 2 then return false end
  local header = buf(0, 1):uint()
  if header ~= REQUEST_HEADER and header ~= RESPONSE_HEADER then return false end
  hyperdht_proto.dissector(buf, pinfo, tree)
  return true
end

hyperdht_proto:register_heuristic("udp", heuristic_checker)

-- Also registered against the known HyperDHT bootstrap port (constants.js
-- BOOTSTRAP_NODES all use :49737) for explicit "Decode As" use — most real
-- traffic between two already-connected nodes uses ephemeral ports on both
-- ends, where only the heuristic above will catch it.
local udp_port_table = DissectorTable.get("udp.port")
udp_port_table:add(49737, hyperdht_proto)
