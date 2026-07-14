# Spiritual Arts Roll Bridge

A Foundry VTT module that receives live events from
[Spiritual Arts](https://spiritualarts.grainserver.co.uk/) and displays them in
Foundry chat. It targets Foundry VTT 12 and Dungeons & Dragons Fifth Edition
4.3.9.

Spirit Die results remain authoritative on the website. Phase one also lets the
website request tightly constrained Spiritual Arts attack, damage, and healing
rolls, plus informational saving throws that do not need attached dice.
Requested dice are rolled by Foundry Core and are authoritative in Foundry.

## Behaviour

- Only the Foundry user selected in the world setting opens the website
  WebSocket and authors messages. Other Foundry clients remain silent.
- Spirit Die cards include the selected SP tier's investment effect in an
  initially collapsed, expandable section when a technique was selected.
- Attack, damage, and healing `foundry_action_request` events become native
  Foundry Core roll messages. Attack formulas are derived from the character's
  Spiritual Arts attack modifier instead of accepting a client-supplied
  formula. Flavor identifies the website character, technique, action label,
  and damage or healing type where relevant.
- An attack whose modifier is unavailable becomes a normal non-roll ChatMessage
  card stating that the modifier is unavailable, rather than rolling with an
  incorrect bonus.
- A save-only request becomes a normal non-roll ChatMessage card. It shows the
  informational DC and target ability and can carry the same optional measured
  template control without constructing or evaluating a Foundry `Roll`.
- Roll actions can optionally show the character's Spiritual Arts save DC and
  target ability; save-only actions always do. Either kind can include a button
  that enters Foundry's standard measured-template preview and placement
  workflow for the clicking user.
- No Foundry Actor is selected or changed. There is no automatic damage,
  healing, targeting, saving-throw roll, condition, or active effect. Placed
  templates are plain scene documents with no mechanical logic.
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
Malformed events and failed actions are isolated and do not close the
WebSocket.

A `spirit_die_roll` may include `roll.investmentEffect`, containing the
selected SP tier's plain-text effect description. It is trimmed, limited to
8,000 characters, safely escaped by the chat template, and omitted by legacy
events or rolls without a valid character-owned technique.

Because the parser uses a strict field allowlist, install and reload this
updated Foundry module before deploying website versions that send newly added
fields or action kinds. The updated module remains compatible with older
website events; a pre-update module will discard events containing
`investmentEffect` or `roll_attack` data it does not recognise.

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
      "portraitUrl": null,
      "spiritualArtsDc": 16
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
      "label": "Essence damage",
      "savingThrow": { "ability": "dex" },
      "template": { "type": "circle", "distance": 20 }
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
Both roll kinds require `formula`; either may also include `savingThrow`.

A saving throw with no attached dice uses this strict action shape:

```json
{
  "id": "49c1f688-3a4e-4d34-8bde-8f9786798bba",
  "kind": "saving_throw",
  "label": "Resist the push",
  "savingThrow": { "ability": "str" },
  "template": { "type": "cone", "distance": 15, "angle": 90 }
}
```

For `saving_throw`, `savingThrow` is required, `label` and `template` are
optional, and `formula` and `damageType` are rejected. Consequently every
accepted action specifies dice, a saving throw, or both; a template by itself
is not an action.

A Spiritual Arts attack uses this strict action shape:

```json
{
  "id": "e419a6d0-b9b9-4c60-ab9e-a07668cf2119",
  "kind": "roll_attack",
  "label": "Seeking strike"
}
```

For `roll_attack`, only `id`, `kind`, and the optional `label` are accepted.
`formula`, `damageType`, `savingThrow`, and `template` are rejected. Its
character must contain `spiritualArtsAttackModifier`, either an integer from
-3 to 16 or `null` when the website cannot derive it. That field is rejected
on every other action kind. Foundry constructs `1d20 + N`, `1d20 - N`, or
`1d20` for a positive, negative, or zero modifier respectively. A `null`
modifier produces an informational non-roll card.

`spiritualArtsDc` is optional for rolling-deployment compatibility. When
present it is an integer from 1 to 100, or `null` when unavailable; omission is
also displayed as unavailable. A save can target `str`, `dex`, `con`, `int`,
`wis`, or `cha`; it is informational and does not ask Foundry to roll or target
tokens. Optional template shapes are:

```json
{ "type": "circle", "distance": 20 }
{ "type": "cone", "distance": 30, "angle": 53.13 }
{ "type": "rectangle", "distance": 15 }
{ "type": "ray", "distance": 60, "width": 5 }
```

Distances, ray widths, and cone angles may be decimal numbers. Distances and
widths are greater than 0 and at most 1,000; angles are greater than 0 and at
most 360. Circle distance is its radius. Rectangle distance is its square side
length and is converted to Foundry's diagonal representation. Placing a
template requires an active scene and the clicking user's `TEMPLATE_CREATE`
permission; right-click cancels placement.

The action ChatMessage stores these module flags: `eventId`,
`protocolVersion`, `sourceRollEventId`, `actionId`, `actionKind`, and (for
damage) `damageType`. Attack messages also store
`spiritualArtsAttackModifier`, including `null`. When configured, messages
also store `spiritualArtsDc`, `savingThrow`, and `template` so every client can
render and execute its local chat control.

## Formula safety

For damage and healing actions, the module independently enforces the phase-one
grammar before also calling Foundry Core's `Roll.validate`. Attack formulas are
constructed from the validated modifier and pass through the same Foundry
validator. Save-only and unavailable-attack actions do not call the Roll API:

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
native Roll and plain ChatMessage boundaries, deterministic IDs and flags,
duplicate suppression, retryability after failed creation, reconnection-safe
event handling, measured-template conversion and preview boundaries, and the
unchanged Spirit Die renderer.

```powershell
npm test
```

Final roll and informational ChatMessage rendering must also be checked in a
Foundry v12 world because Foundry globals are unavailable to Node tests.

## First Foundry v12 smoke test

1. Install the junction above, launch a Foundry v12 world running dnd5e 4.3.9,
   enable the module, and select a dedicated bridge user in module settings.
2. Reload the world as requested and sign in as that selected user. Open the
   browser developer console and confirm the WebSocket connects without module
   errors. A different logged-in Foundry user should remain inactive.
3. On the website, use a character-owned technique whose selected SP tier has
   one attack action, one damage action (`2d8 + 4`, `necrotic`), one healing
   action (`1d6`), and one save-only action with no formula.
4. Make a Spirit Die roll for that technique and exact SP tier; either a
   success or failure triggers its actions.
5. Confirm Foundry chat shows the Spirit Die card followed by three separate
   native roll messages plus a plain save-only card authored by the selected
   bridge user. Expand the Spirit Die card's investment-effect section and
   confirm it shows the description from the exact SP tier that was cast.
6. Expand each native roll. Confirm its formula and dice tooltip work, and its
   flavor shows the website character, technique, configured/fallback action
   label, with `Spiritual Arts attack`, `Necrotic damage`, or `Healing` as the
   relevant fallback/type text.
7. Configure a Dexterity save and 20-foot circle on either roll. Confirm the
   card displays the character's Spiritual Arts DC and a measured-template
   button. Click it as a permitted user, place the circle, and confirm it is a
   plain 20-foot-radius scene template. Right-click should cancel a preview.
   Confirm the save-only card displays its configured ability and optional
   template in the same way, but contains no dice result or tooltip.
8. Repeat the attack with an unavailable website modifier. Confirm Foundry
   creates a non-roll card saying `Attack modifier unavailable` and does not
   show a dice result.
9. Make a failed Spirit Die roll for the same tier and confirm all configured
   actions and controls still follow the failure card.
10. Sign the bridge user out, make another website roll, then sign back in.
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
