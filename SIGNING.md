# Code Signing — killing the "Windows protected your PC" warning

ModForge is currently **unsigned**, so Windows SmartScreen shows *"Windows protected
your PC"* on first run (users click **More info → Run anyway**). That warning goes away
once the app is signed by a certificate Windows trusts and the download has built enough
reputation. This is a step **you** (the project owner) do — it involves buying a
certificate tied to your identity, which can't be automated away.

## The two certificate options

| | **OV (Organization Validation)** | **EV (Extended Validation)** |
|---|---|---|
| Cost | ~$100–250/yr | ~$250–400/yr |
| SmartScreen | Warning clears **after reputation builds** (some downloads/installs over days–weeks) | **Instant** trust, no reputation wait |
| Storage | Software cert (file) or token | Hardware token / cloud HSM required |
| Who can get it | Individuals + businesses | Usually businesses (some issue to sole proprietors) |
| Best for | Indie / hobby projects on a budget | If you want zero warnings from day one |

Reputable issuers: **DigiCert**, **Sectigo**, **SSL.com**, **Certum** (Certum offers a
lower-cost option that individual open-source developers can get). Since ~2023 all new
publicly-trusted code-signing certs must be stored on hardware (a USB token or a cloud
HSM) — you can't just get a `.pfx` file for a fresh OV cert anymore; expect a token or a
cloud-signing service.

## What signing looks like (once you have a cert)

Tauri can sign the installer during `tauri build` if you point it at your cert.

### Option A — cloud/HSM signing (modern OV/EV)

Most 2024+ certs sign via a provider tool (e.g. **SSL.com eSigner**, **DigiCert
KeyLocker**, **Azure Trusted Signing**). You give Tauri a custom sign command:

```jsonc
// src-tauri/tauri.conf.json  →  "bundle": { "windows": { ... } }
"windows": {
  "signCommand": "signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /f %1"
  // or your provider's CLI, e.g. CodeSignTool / Azure Trusted Signing action
}
```

**Azure Trusted Signing** is currently the cheapest hands-off route (~$10/mo, no physical
token) if you can pass their identity validation — worth checking first.

### Option B — local token/.pfx (older setups)

```powershell
# one-off, or in CI as a secret
signtool sign /fd SHA256 /a /f "C:\path\to\cert.pfx" /p "<password>" `
  /tr http://timestamp.sectigo.com /td SHA256 `
  "src-tauri\target\release\bundle\nsis\ModForge_<ver>_x64-setup.exe"
```

Always include a **timestamp** (`/tr ... /td sha256`) so signatures stay valid after the
cert expires.

### Verify

```powershell
signtool verify /pa /v "ModForge_<ver>_x64-setup.exe"
# or
Get-AuthenticodeSignature ".\ModForge_<ver>_x64-setup.exe" | Format-List
```

## Recommended path for this project

1. **Short term (free):** keep shipping unsigned. The README already tells users about
   *More info → Run anyway*. This is normal and safe for open-source indie apps.
2. **When ready to look pro:** get an **OV** cert from Certum/Sectigo (or set up **Azure
   Trusted Signing**), add the `signCommand` to `tauri.conf.json`, and rebuild. OV clears
   SmartScreen after your downloads build reputation.
3. **If you want zero warnings instantly:** go **EV** (or Azure Trusted Signing, which is
   treated favorably) — no reputation wait.

## Notes

- Signing proves the installer came from you and wasn't tampered with — it does **not**
  submit the app to Microsoft or require their approval.
- Sign **both** the installer *and* the portable `ModForge.exe` for a clean experience.
- Keep the certificate/token credentials out of the repo. In CI, store them as encrypted
  secrets.
- A cert is tied to your legal identity/organization — that's the whole point, and why
  this can't be done for you automatically.
