# Spiritual Arts Roll Bridge

A Foundry VTT module that receives live events from
[Spiritual Arts](https://spiritualarts.grainserver.co.uk/) and displays them in
Foundry chat. It targets Foundry VTT 12 and Dungeons & Dragons Fifth Edition
4.3.9.

Spirit Die results remain authoritative on the website. Phase one also lets the
website request tightly constrained damage and healing rolls; those dice are
rolled by Foundry Core and are authoritative in Foundry.

## Behaviour

- Only the Foundry user selected in the world setting opens the website
  WebSocket and authors messages. Other Foundry clients remain silent.
- Existing `spirit_die_roll` events keep their styled chat-card output.
- Each `foundry_action_request` becomes a native Foundry Core roll message. Its
  flavor identifies the website character, technique, action label, and damage
  or healing type.
- No Foundry Actor is selected or changed. There is no automatic damage,
  healing, targeting, attack roll, saving throw, condition, or active effect.
- Duplicate event IDs are suppressed with a bounded in-memory set, existing
  ChatMessage flags, and deterministic 16-character document IDs created with
  `keepId`.
- An event is remembered only after ChatMessage creation succeeds. A duplicate
  redelivery can therefore retry a transient failure, but the bridge does not
  request or guarantee redelivery.
- If the selected user is offline, events are dropped. There is no backlog,
  replay, acknowledgement, or upstream result report.

## Development installation on Windows

Keep this repository outside Foundry's data directory, then create a directory
junction from Foundry's module directory. Close Foundry before creating it.

```powershell
$source = "C:\Users\apgul\1007 Spiritual Arts Local Build\Spiritual-Arts-Foundry"
$modules = "$env:LOCALAPPDATA\FoundryVTT\Data\modules"
New-Item -ItemType Directory -Force -Path $modules
New-Item -ItemType Junction -Path "$modules\spiritual-arts-foundry" -Target $source
```

If Foundry uses a custom data directory, replace `$modules` with its
`Data/modules` path.

Restart Foundry, enable **Spiritual Arts Roll Bridge** in the world, then open:

1. Game Settings
2. Configure Settings
3. Module Settings
4. Roll bridge user

Select the user that should author messages and accept Foundry's reload prompt.
Choosing **Disabled** turns the integration off.

## Realtime contract

The configured user connects to the existing live endpoint:

```text
wss://spiritualarts.grainserver.co.uk/ws
```

The parser accepts only protocol version 1 and the event types
`spirit_die_roll` and `foundry_action_request`. Every object is validated with a
strict field allowlist; unknown fields, versions, and event types are ignored.
Malformed events and failed rolls are isolated and do not close the WebSocket.

One action request has this wire shape:

```json
{
  "protocolVersion": 1,
  "eventId": "e131f252-9d65-4f43-a822-243e2560ed60",
  "type": "foundry_action_request",
  "data": {
    "requestedAt": "2026-07-13T12:00:00.100Z",
    "sourceRollEventId": "5c13c52f-f89d-41f5-8816-7d5ac0ab132f",
    "character": {
      "id": "character-1",
      "name": "Raan",
      "path": "Path of Gluttony",
      "level": 8,
      "portraitUrl": null
    },
    "technique": {
      "id": "89843a7a-b538-4c16-beee-56255e41615e",
      "name": "Devour Essence"
    },
    "spInvestment": 2,
    "action": {
      "id": "1de7331d-7607-4932-8392-379710cc30f1",
      "kind": "roll_damage",
      "formula": "2d8 + 4",
      "damageType": "necrotic",
      "label": "Essence damage"
    }
  }
}
```

`eventId`, `sourceRollEventId`, technique IDs, and action IDs must be UUIDs.
`requestedAt` must be a finite UTC ISO timestamp. Character names, paths,
technique names, and optional non-empty labels are trimmed and limited to 255
characters. Character levels are 1–20 and SP investment is 1–100. Labels are
omitted when unused. Damage actions require exactly one of these types:

```text
acid, bludgeoning, cold, fire, force, lightning, necrotic, piercing,
poison, psychic, radiant, slashing, thunder
```

Healing actions use `"kind": "roll_healing"` and must omit `damageType`.

The action ChatMessage stores these module flags: `eventId`,
`protocolVersion`, `sourceRollEventId`, `actionId`, `actionKind`, and (for
damage) `damageType`.

## Formula safety

The module independently enforces the phase-one grammar before also calling
Foundry Core's `Roll.validate`:

- A formula is at most 200 characters before trimming and at most 50 terms.
- A term is an unsigned integer or `NdM` dice term. Terms may be joined only by
  `+` or `-`, with optional whitespace around operators.
- A dice term has 1–100 dice and 2–1000 faces. A whole formula has at most 100
  dice total.
- An integer constant is between 0 and 1,000,000.
- Unary signs, parentheses, multiplication, roll modifiers, functions, `@`
  data references, inline document syntax, macros, and scripts are rejected.

Examples accepted: `2d8 + 4`, `1d6 + 1d4`, `3d10 - 2`.

## Tests

The tests exercise strict protocol parsing, formula bounds, bridge-user gating,
native Roll and ChatMessage boundaries, deterministic IDs and flags, duplicate
suppression, retryability after failed creation, reconnection-safe event
handling, and the unchanged Spirit Die renderer.

```powershell
npm test
```

Final Roll and ChatMessage rendering must also be checked in a Foundry v12
world because Foundry globals are unavailable to Node tests.

## First Foundry v12 smoke test

1. Install the junction above, launch a Foundry v12 world running dnd5e 4.3.9,
   enable the module, and select a dedicated bridge user in module settings.
2. Reload the world as requested and sign in as that selected user. Open the
   browser developer console and confirm the WebSocket connects without module
   errors. A different logged-in Foundry user should remain inactive.
3. On the website, use a character-owned technique whose selected SP tier has
   one damage action (`2d8 + 4`, `necrotic`) and one healing action (`1d6`).
4. Make a successful Spirit Die roll for that technique and exact SP tier.
5. Confirm Foundry chat shows the existing Spirit Die card followed by two
   separate native roll messages authored by the selected bridge user.
6. Expand each native roll. Confirm its formula and dice tooltip work, and its
   flavor shows the website character, technique, configured/fallback action
   label, and `Necrotic damage` or `Healing`.
7. Make a failed Spirit Die roll for the same tier and confirm only the failure
   card appears—no damage or healing roll should follow.
8. Sign the bridge user out, make another website roll, then sign back in.
   Confirm the missed events are not replayed.

## Delivery and security limitations

This is a one-way, best-effort live stream. The website cannot currently tell
whether the bridge was offline or an action command reached Foundry, and
delivery is not guaranteed.

The public website currently has no strong authentication. The bridge never
executes scripts, macros, document references, or Actor data, and all external
text inserted into action flavor HTML is escaped. Do not add automatic HP
changes or other state-changing Foundry automation until authenticated,
authorized subscriptions and commands are designed.
