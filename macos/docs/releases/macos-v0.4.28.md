The first release signed with the app's own certificate: after this update, macOS keeps what you allowed across updates.

**Install or update** (macOS 14 or newer; Zotero 10 with the bridge plugin). From 0.3.1 on, the menu bar offers it
(*Update to 0.4.28…*); otherwise:

```bash
curl -fsSL https://github.com/mbradaschia/zotero-companion-launcher/releases/download/macos-v0.4.28/install.sh | bash
```

Updates keep your configuration: they replace the app and the runner's own folder, never your settings, prompts,
taxonomies, saved searches, API keys or hotkey. The runner and the bridge are unchanged.

**Allow it one last time.** Until now each build was signed ad hoc, so macOS took every update for a new app and asked
again for what you had allowed, such as the external drive your sync folder is on. This one is signed with the app's
own certificate (self-signed, made once on your Mac), and macOS remembers your answer for every later build signed
with it. It asks once more for this update, then stops. (0.4.26 and 0.4.27 said they were signed this way, but no
certificate had been saved yet, so they were still ad hoc.)

**The certificate script works on macOS 26.** It stopped without a word: macOS couldn't find the certificate in the
keychain it made, and the error was hidden. Now that keychain is found, and any step that fails says which one and why.
Every build now tests the script and the signing with a throwaway certificate.

It's self-signed and not notarized, so the installer still clears the download's quarantine as before.
