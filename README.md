# Spiritual Arts Roll Bridge

A small Foundry VTT module that displays website-authoritative Spirit Die rolls
from [Spiritual Arts](https://spiritualarts.grainserver.co.uk/) in Foundry chat.

The initial release targets Foundry VTT 12 and D&D Fifth Edition 4.3.9. It does
not ask Foundry to roll dice or update Actors. The website remains authoritative.

## Behaviour

- Only the Foundry user selected in the world setting opens the website
  WebSocket.
- Other connected users remain inactive and produce no duplicate messages.
- If the selected user is offline, the bridge is off. Rolls made during that
  time are deliberately discarded and are never replayed.
- Each valid roll becomes a styled chat message authored by the selected user.
- The website character name is displayed in the card; no Foundry Actor mapping
  is required.
- Event IDs are retained in a bounded in-memory set and in ChatMessage flags.
  They also produce deterministic Foundry document IDs, preventing duplicate
  messages if the selected account is briefly connected in two sessions.

## Development installation on Windows

Keep this repository outside Foundry's data directory, then create a directory
junction from Foundry's module directory. Close Foundry before creating it.

```powershell
$source = "C:\Users\apgul\1007 Spiritual Arts Local Build\Spiritual-Arts-Foundry"
$modules = "$env:LOCALAPPDATA\FoundryVTT\Data\modules"
New-Item -ItemType Directory -Force -Path $modules
New-Item -ItemType Junction -Path "$modules\spiritual-arts-foundry" -Target $source
```

If Foundry uses a custom data directory, replace `$modules` with its `Data/modules`
path.

Restart Foundry, enable **Spiritual Arts Roll Bridge** in the world, then open:

1. Game Settings
2. Configure Settings
3. Module Settings
4. Roll bridge user

Select the user that should author the messages and accept Foundry's reload
prompt. Choosing **Disabled** turns the integration off.

## Realtime contract

The module connects to:

```text
wss://spiritualarts.grainserver.co.uk/ws
```

It accepts version-one `spirit_die_roll` messages with a UUID `eventId`. Unknown
versions and malformed events are ignored. The WebSocket is a live event stream,
not a queue.

## Tests

The test suite exercises protocol validation, designated-user connection gating,
and duplicate suppression without requiring a running Foundry instance.

```powershell
npm test
```

Final UI and document-creation behaviour should also be checked inside a Foundry
VTT 12 world because Foundry globals are only available there.

## Security note

The current website WebSocket is a public, read-only event stream. It does not
accept roll commands, but anyone who knows the endpoint can observe broadcast
roll details. Add subscription authentication before using it for campaign data
that should not be publicly observable.
