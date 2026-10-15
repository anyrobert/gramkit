# Store listings

Copy-paste text for the Chrome Web Store and addons.mozilla.org (AMO). Images come from `npm run marketing` (`dist/marketing/store/`); packages from `npm run build` and `npm run source`.

Links used everywhere:

- Website: https://anyrobert.github.io/gramkit/
- Privacy policy: https://anyrobert.github.io/gramkit/privacy.html
- Support: https://github.com/anyrobert/gramkit/issues
- Chrome Web Store: https://chromewebstore.google.com/detail/gramkit/nkcecpcmacdmonehkefhhlbnenpgiojk

---

## Chrome Web Store

**Package:** `dist/gramkit-chrome-<version>.zip`

### Store listing

- **Name:** Gramkit (comes from the manifest)
- **Summary:** comes from the manifest (`_locales/*/messages.json`, ≤132 characters)
- **Category:** Social Networking (fallback: Tools)
- **Language:** English, then add Português (Brasil) with the text below
- **Screenshots (1280×800):** `screenshot-1.png` … `screenshot-5.png`, in order
- **Small promo tile (440×280):** `promo-small.png`
- **Marquee promo tile (1400×560):** `promo-marquee.png`
- **Homepage URL:** website above
- **Support URL:** support above

#### Description (English)

```text
Instagram finally has a speed button.

Instagram on the web has no speed control, no seek bar, no volume slider, no downloads and no keyboard shortcuts, and it mutes every video again as you scroll. Gramkit adds all of that, plus focus tools that keep Instagram on the people you follow, or on your messages.

VIDEO
• Speed from 0.25× to 4×. Press > and < to change it, or pick a preset. It sticks across videos, reloads and tabs, with an optional separate speed for the feed, Reels and Stories.
• A real control bar: play/pause, time, a draggable seek bar with time preview, speed menu, volume, picture-in-picture and fullscreen.
• Sound that stays put: no more re-muting on every scroll, and your volume level is kept.
• Autoplay off for the feed, and a choice of loop, stop or next reel when a video ends.
• Frame by frame with , and . and save the exact frame as a PNG.

DOWNLOADS
• Save the post, reel or story on screen at the best quality Instagram has, including every slide of a carousel. Shift+D or the download button on the bar.

KEYBOARD
YouTube- and Gmail-style shortcuts, all rebindable:
• K or Space play/pause · J / L back and forward 10 s · 0–9 jump · M mute · F fullscreen
• Shift+J / Shift+K next and previous post · Shift+L like · Shift+B save · [ ] carousel
• G then H, M, E, R, P or S to go Home, Messages, Explore, Reels, your profile or Saved
• / search · ? shows every shortcut
• Ctrl+K / ⌘K opens a command palette with every action, page and setting, plus your recent profiles.
Shortcuts never fire while you type a message, comment or search.

FOCUS
• Open the Following feed instead of Home.
• Hide Reels, Explore and suggested accounts.
• Messages only: Home, Reels and Explore send you to your messages. Turn it on, or set focus hours (say 9–18 on weekdays).
• Daily time limit from 15 minutes to 2 hours. Past it, a full-screen card covers everything except Messages.

PRIVATE BY DESIGN
No account, no analytics, no servers. Settings stay in your browser. The only requests go to instagram.com, when you ask for a download. Open source under the MIT license.

In English and Brazilian Portuguese.

Gramkit is an independent project, not affiliated with or endorsed by Instagram or Meta.
```

#### Descrição (Português)

```text
O Instagram finalmente tem um botão de velocidade.

O Instagram na web não tem controle de velocidade, barra de avanço, volume, downloads nem atalhos de teclado, e silencia cada vídeo de novo quando você rola a tela. O Gramkit traz tudo isso, além de ferramentas de foco que deixam o Instagram nas pessoas que você segue, ou nas suas mensagens.

VÍDEO
• Velocidade de 0,25× a 4×. Aperte > e < para mudar, ou escolha uma predefinição. Ela vale para todos os vídeos, recarregamentos e abas, com a opção de uma velocidade separada para feed, Reels e Stories.
• Uma barra de controle de verdade: reproduzir/pausar, tempo, barra de avanço com prévia do tempo, menu de velocidade, volume, picture-in-picture e tela cheia.
• Som que fica como você deixou: chega de reativar o som a cada rolagem, e o volume é mantido.
• Reprodução automática desligada no feed, e quando o vídeo acaba: repetir, parar ou ir para o próximo reel.
• Quadro a quadro com , e . e salve o quadro exato como PNG.

DOWNLOADS
• Salve o post, reel ou story na tela na melhor qualidade que o Instagram oferece, incluindo cada foto de um carrossel. Shift+D ou o botão de download na barra.

TECLADO
Atalhos no estilo do YouTube e do Gmail, todos personalizáveis:
• K ou Espaço reproduz/pausa · J / L volta e avança 10 s · 0–9 pula · M silencia · F tela cheia
• Shift+J / Shift+K próximo e anterior post · Shift+L curtir · Shift+B salvar · [ ] carrossel
• G e depois H, M, E, R, P ou S para ir ao Início, Mensagens, Explorar, Reels, seu perfil ou Salvos
• / pesquisa · ? mostra todos os atalhos
• Ctrl+K / ⌘K abre uma paleta de comandos com todas as ações, páginas e configurações, além dos perfis recentes.
Os atalhos nunca disparam enquanto você digita uma mensagem, comentário ou pesquisa.

FOCO
• Abra o feed Seguindo no lugar do Início.
• Esconda Reels, Explorar e contas sugeridas.
• Só mensagens: Início, Reels e Explorar levam você às mensagens. Ligue quando quiser, ou defina um horário de foco (por exemplo, 9–18 nos dias úteis).
• Limite diário de 15 minutos a 2 horas. Depois disso, um aviso em tela cheia cobre tudo, menos as Mensagens.

PRIVADO DE VERDADE
Sem conta, sem análise de uso, sem servidores. As configurações ficam no seu navegador. As únicas requisições vão para o instagram.com, quando você pede um download. Código aberto sob a licença MIT.

Em português do Brasil e inglês.

O Gramkit é um projeto independente, sem afiliação ou endosso do Instagram ou da Meta.
```

### Privacy practices tab

**Single purpose**

```text
Gramkit improves Instagram on the web: it adds video playback controls (speed, seeking, volume), keyboard shortcuts, downloads of the post on screen, and optional focus tools such as a daily time limit.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the user's settings, last speed and volume, today's time on Instagram for the optional daily limit, and recently opened profile names for the command palette. All of it stays in the browser. |
| `downloads` | Saves the post, reel, story or video frame the user asks to download into Downloads/Gramkit/. Nothing is downloaded without a user action. |
| Host permission `https://www.instagram.com/*` | The content script adds the control bar, shortcuts and focus tools to instagram.com, and requests the media of a post from Instagram's own API (with the user's session) when the user asks for a download. It runs on no other site. |

**Remote code:** No, I am not using remote code. All code is bundled in the package.

**Data usage:** check none of the data types. Gramkit collects and transmits no user data.

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** privacy policy above.

### Distribution

- Visibility: Public. Regions: all. Free.

---

## addons.mozilla.org (Firefox, Zen)

**Package:** `dist/gramkit-firefox-<version>.xpi`
**Submit from the terminal:** `WEB_EXT_API_KEY=… WEB_EXT_API_SECRET=… npm run submit:firefox` builds, packs the source and uploads both with `store/amo-metadata.json` (summary, description in English and Portuguese, categories, homepage, support, license). Screenshots, the privacy policy and the support email still go in the AMO dashboard after.

**Source code:** `dist/gramkit-source-<version>.zip` (answer **Yes** to "Do you need to submit source code?", since the build bundles TypeScript with esbuild)

### Listing

- **Name:** Gramkit
- **Add-on URL:** `gramkit`
- **Summary (≤250 characters):**

  ```text
  Instagram finally has a speed button. Speed 0.25–4×, a real seek bar, volume, downloads, YouTube-style keyboard shortcuts, a ⌘K command palette and focus tools like a daily time limit. No account, no tracking.
  ```

- **Description:** the English Chrome description above (AMO accepts the same plain text). Add the Portuguese one as a pt-BR translation.
- **Categories:** Photos, Music & Videos; Social & Communication
- **Tags:** instagram, video speed, keyboard shortcuts, downloader, productivity
- **Support email / site:** your email; support URL above
- **Homepage:** website above
- **License:** MIT
- **Privacy policy:** paste the text of `docs/privacy.html` (AMO wants the text, not a link)
- **Screenshots:** the five store screenshots

### Notes to reviewer

```text
Gramkit is written in TypeScript and bundled with esbuild (not minified). The attached source archive rebuilds the exact package:

  Requirements: Node.js 20 or newer, npm, and the zip command (macOS or Linux).
  npm ci
  npm run build
  → the add-on is in dist/firefox/ (also packed as dist/gramkit-firefox-<version>.xpi)

scripts/build.mjs writes the manifest and bundles src/content/main.ts, src/background.ts, src/popup/popup.ts and src/options/options.ts, one IIFE file each. Static files (HTML, CSS, icons, fonts, _locales) are copied from src/static unchanged.

The extension only runs on www.instagram.com. Its single network request is to Instagram's own media endpoint (/api/v1/media/{id}/info/) with the user's session, when the user asks to download the post on screen. It collects no data (data_collection_permissions: none) and loads no remote code.

To try it: open any reel on instagram.com and press > to speed it up, or ? to see every shortcut. Downloads need a logged-in account.
```
