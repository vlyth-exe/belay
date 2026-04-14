# Changelog

## [0.3.0](https://github.com/belay-codes/belay/compare/belay-v0.2.0...belay-v0.3.0) (2026-04-14)


### Features

* auto-update system with cross-platform builds and npm installer ([#14](https://github.com/belay-codes/belay/issues/14)) ([5413c95](https://github.com/belay-codes/belay/commit/5413c958db13180127eca2a71c3729cc4201530c))
* **ci:** auto-publish belay-code to npm on release ([e267f96](https://github.com/belay-codes/belay/commit/e267f96b81a5636068a9780f96ae934a2f20a441))


### Bug Fixes

* **ci:** use npm Trusted Publishing with OIDC instead of NPM_TOKEN ([836637b](https://github.com/belay-codes/belay/commit/836637b89a7f7e89072628b6d57d5b7b8e98e9d1))
* force LF line endings in npm package scripts ([7cd5c64](https://github.com/belay-codes/belay/commit/7cd5c647fb405c559681c14a63bee4713bef827d))


### Code Refactoring

* rename npm package from belay-code to belay-app ([c2cdcef](https://github.com/belay-codes/belay/commit/c2cdcefcf248415969e44a891fe9aaf7e9137bd7))

## [0.2.0](https://github.com/belay-codes/belay/compare/belay-v0.1.0...belay-v0.2.0) (2026-04-14)


### Features

* add ACP Agent Mode switcher ([e18b3cf](https://github.com/belay-codes/belay/commit/e18b3cf45d9f21f42e0fb06c71df33b3bbc92c10))
* add ACP agents to managed sessions ([ea83c67](https://github.com/belay-codes/belay/commit/ea83c67fece78ee6a6c7c95ecf95574b03a60a98))
* add ACP integration with UI ([b830593](https://github.com/belay-codes/belay/commit/b83059335c30f7b8d71e900186d039faed1df77a))
* add application logo ([aedd902](https://github.com/belay-codes/belay/commit/aedd9028bd79496573515fe325d8e1d8ef8dac03))
* add basic project support ([e403ce0](https://github.com/belay-codes/belay/commit/e403ce0967500aa10b177a8cf35602c8cb8d48ab))
* add edit/resend and copy actions to user messages ([985a332](https://github.com/belay-codes/belay/commit/985a33290e4a1992a06a16dddb8a14be5bd14c35))
* add integrated terminal support ([213a0d8](https://github.com/belay-codes/belay/commit/213a0d8c5edd5c0aa1f86ab82a3622badecb000c))
* add message blocks and thinking stream support ([ac96dc1](https://github.com/belay-codes/belay/commit/ac96dc1b50bd1430279e1fa7bbe25edec2f7199e))
* add option to disable notifications in settings ([f238599](https://github.com/belay-codes/belay/commit/f238599c88154e936bc4862450bd08cb01fe3018))
* add prompt branching to create new session from any message ([9163c53](https://github.com/belay-codes/belay/commit/9163c53e35942a51bb357cc1c70602bf2339bedf))
* add release-please automation and sidebar improvements ([#6](https://github.com/belay-codes/belay/issues/6)) ([f785bbc](https://github.com/belay-codes/belay/commit/f785bbc1dc11dd548f12b16a93dcc50973f4fbb6))
* add rename session via right-click context menu ([c3585e8](https://github.com/belay-codes/belay/commit/c3585e838943c65b1543f37972a78bfb89e0dc21))
* add session capabilities ([654de0e](https://github.com/belay-codes/belay/commit/654de0e7c762fbfedc153ebf0146ee174c1c8818))
* add session groups ([5b69563](https://github.com/belay-codes/belay/commit/5b69563d1352afe731cc30efdc7b2a35d14d4ac1))
* add session status indicators to sidebar ([1be3015](https://github.com/belay-codes/belay/commit/1be301548e9acc300f58af73679e7e84b9b0ba4c))
* add settings menu with ACP configuration ([62483ad](https://github.com/belay-codes/belay/commit/62483adfc2d91e7e1f77add5269ce361d70f6fb7))
* add slash command support ([d963195](https://github.com/belay-codes/belay/commit/d963195bb9d3f0bdcf1fa221cf419188540ddc84))
* add support for markdown tables ([e149ba8](https://github.com/belay-codes/belay/commit/e149ba84193e49299c116a9e9c7e34f7c5850d49))
* add tabbed terminal support — multiple instances per session ([6c1402c](https://github.com/belay-codes/belay/commit/6c1402c926b33d972cbf47e944fa416a6994aaad))
* add theme switcher ([0e90f7f](https://github.com/belay-codes/belay/commit/0e90f7f2dfaa78e035bbcd0ac0e99db75ea1013a))
* add WSL support ([de755ba](https://github.com/belay-codes/belay/commit/de755bad0fca2f98ecc9a5ad09503ed449dad3fe))
* clicking a notification navigates to the relevant session ([bbad287](https://github.com/belay-codes/belay/commit/bbad28742a6bf6ede01283beb0d0606effef6bd0))
* custom terminal profiles + auto WSL detection ([aff2118](https://github.com/belay-codes/belay/commit/aff211831fc5d4bf93016ec80c75494713b5c54c))
* drag-and-drop to reorder terminal tabs ([713ac8b](https://github.com/belay-codes/belay/commit/713ac8bb5d6394b791c30788911423377cfce003))
* edit messages inline within chat bubble instead of input field ([1072dba](https://github.com/belay-codes/belay/commit/1072dba05a2475823e74a4a45cc36dec0bf7a075))
* enable drag-to-reposition for groups ([535e501](https://github.com/belay-codes/belay/commit/535e501cfdc460f9f18abf1c04961f2e43ac047c))
* enable project switching via session click ([f30461f](https://github.com/belay-codes/belay/commit/f30461ff3646a7cd96c1a137e2fb1784eb3a7c43))
* git integration — sidebar panel, title bar dropdown, worktree management ([#3](https://github.com/belay-codes/belay/issues/3)) ([ba43aa1](https://github.com/belay-codes/belay/commit/ba43aa112bb73257bf2f4aa75b558a793a3942d2))
* implement persistent sessions ([fce0249](https://github.com/belay-codes/belay/commit/fce0249b793046f58db6d94a9566d9b7f256fce5))
* initial commit ([18ef40c](https://github.com/belay-codes/belay/commit/18ef40c5a2357b795f076d202346243e1a759f73))
* initialize Electron project with basic chat UI ([4e7ba9f](https://github.com/belay-codes/belay/commit/4e7ba9f1b26ef41911be5120f01f9c6dd519af8d))
* inline permission request UI and taskbar icon ([d4cc40b](https://github.com/belay-codes/belay/commit/d4cc40bd23acfd6c9a0b40415f59f46752741c91))
* integrate ACP with chat input ([078353c](https://github.com/belay-codes/belay/commit/078353ca20fe2438627079cc95a20408a8494b95))
* integrated terminal support with tabbed sessions ([d512904](https://github.com/belay-codes/belay/commit/d5129047ae9a015db0fc324c8d6c5faac4816cbc))
* invert logo on dark themes ([861e574](https://github.com/belay-codes/belay/commit/861e574d438ecc9639745e590146624363ccfe2c))
* make terminal tabs horizontally scrollable when there are many open ([5873523](https://github.com/belay-codes/belay/commit/58735239fa68872ed39cb24b3442868633960c26))
* notify when prompt finishes while window is minimized or unfocused ([5046645](https://github.com/belay-codes/belay/commit/50466454106f6e7182d620f58b166530e32db6dd))
* persist expanded/collapsed state for projects; default new projects to expanded ([d433c95](https://github.com/belay-codes/belay/commit/d433c95289bbeddc23499c6c4ccdbac1bd5560e8))
* right collapsing sidebar with directory explorer ([#2](https://github.com/belay-codes/belay/issues/2)) ([6486fcb](https://github.com/belay-codes/belay/commit/6486fcb5cd8432218a2269ec609601df66a3d6a8))
* right sidebar UI polish - remove separators, add right padding, rounded git hover ([af2db9a](https://github.com/belay-codes/belay/commit/af2db9a0b9241d5fa490695859002dcdd3595e62))
* right-click context menu on terminal tabs ([3ad6f4f](https://github.com/belay-codes/belay/commit/3ad6f4fb660c70b857a2bdb172d70ee012ef455b))
* right-click terminal tab to rename ([99936c9](https://github.com/belay-codes/belay/commit/99936c95c533d750f16a695783bb63a0eceb7ed3))
* send native OS notification when prompt completes in background ([c362e68](https://github.com/belay-codes/belay/commit/c362e68ad87ee7c242131a836de3ec26d9138fea))
* show thin visible scrollbar on terminal tab bar ([a22f9fa](https://github.com/belay-codes/belay/commit/a22f9fac533f268ecba2ae72948e799405998c2f))
* sidebar inset layout — unified chrome with floating content card ([7649d2d](https://github.com/belay-codes/belay/commit/7649d2dd62f6ca8cb65f02db69b101470e5689bd))
* terminal theme auto-matches the selected app theme ([befcb90](https://github.com/belay-codes/belay/commit/befcb90e4a8166f50a94fe30f08f119e3ee35b67))
* UI overhaul — prompt box redesign, terminal panel, sidebar polish & git improvements ([fc22984](https://github.com/belay-codes/belay/commit/fc229847828dabd1a93e968f8d07d8ad02fea11d))
* **ui:** add gradient fade effect for messages behind prompt box ([d35a1b3](https://github.com/belay-codes/belay/commit/d35a1b31c7f0a77917d1188573b6547aa79634a5))
* **ui:** add slide-in animation to terminal panel ([9a8e12b](https://github.com/belay-codes/belay/commit/9a8e12b34cf1fa4e5e41613a14cbc02ee3d76809))
* **ui:** animate terminal tray open/close with height transition ([383c590](https://github.com/belay-codes/belay/commit/383c5905aafcf54936913b063d4e5448df33864f))
* update Belay logo asset ([0c3c4e1](https://github.com/belay-codes/belay/commit/0c3c4e16671e5ab23bc8dc8ff25b32d36f00ca19))
* use agent icon in prompt box selector ([5743740](https://github.com/belay-codes/belay/commit/5743740e142c1815b03b96c99afe17a08d02561d))


### Bug Fixes

* allow new session creation after last session deletion ([10a56cf](https://github.com/belay-codes/belay/commit/10a56cf3798ed5508e4fa48072b3b683ae8ca1e9))
* apply inline rename input to ungrouped sessions too ([aed3c44](https://github.com/belay-codes/belay/commit/aed3c44cc44d72a6f0e9233f3787b9c972e0ccb9))
* block user input until harness selection is complete ([b68c6dd](https://github.com/belay-codes/belay/commit/b68c6dd81f212202c099d78d3832543a9016ec60))
* **ci:** correct release-please workflow configuration ([#8](https://github.com/belay-codes/belay/issues/8)) ([9bed74e](https://github.com/belay-codes/belay/commit/9bed74e6b8d87b4f484987ed29d47e1260fec7d4))
* enable double-click maximisation on titlebar ([9b130ef](https://github.com/belay-codes/belay/commit/9b130effd57672cecaf05c37a58af7e0fb7433d2))
* hardcode full theme for default light/dark (oklch unresolvable) ([9e01b76](https://github.com/belay-codes/belay/commit/9e01b7636e7555f8d955b63ee57138b1694a6953))
* include agent response when branching from a user message ([c84f548](https://github.com/belay-codes/belay/commit/c84f5482f794924564a461d41d17d0710f2a6c28))
* last terminal line no longer clipped by padding ([f894f78](https://github.com/belay-codes/belay/commit/f894f783379a14a135c5bd617acfc4aa7e084486))
* patch node-pty SpectreMitigation and 7za symlink errors for packaging ([#5](https://github.com/belay-codes/belay/issues/5)) ([761c3cf](https://github.com/belay-codes/belay/commit/761c3cf70fff88b2fa83d2179b98e1f79975b783))
* Reduce bottom padding of content area ([fc4ac24](https://github.com/belay-codes/belay/commit/fc4ac24e31bd98388529d54f1f730d970b9e8964))
* resolve 5 TypeScript build errors ([#4](https://github.com/belay-codes/belay/issues/4)) ([983b713](https://github.com/belay-codes/belay/commit/983b713bd2ea81b2feb45dc9fdcfd7c730b4659a))
* resolve agent loading issue in saved sessions ([3ad22b2](https://github.com/belay-codes/belay/commit/3ad22b2e722bd52d45ad1bb95283b5bf73356f9f))
* resolve message repetition and add markdown formatting to replies ([05faefd](https://github.com/belay-codes/belay/commit/05faefd6b41775784c546661153317a19575ff2c))
* resolve oklch CSS vars for default light/dark themes ([cbbb25d](https://github.com/belay-codes/belay/commit/cbbb25d8503ea33a1c03fbb6a01e7d99aa9caf83))
* resolve WSL sessions not spawning in correct project directory ([c7894ce](https://github.com/belay-codes/belay/commit/c7894cecefaa5519a5bd5272ba4b5448a40a9f5d))
* robust unseen status tracking based on message counts ([44be1ce](https://github.com/belay-codes/belay/commit/44be1cee7d1ce4b730f5a354ec68796958506729))
* scroll to bottom when opening a saved session ([c1dc8ff](https://github.com/belay-codes/belay/commit/c1dc8ff0bfcfb6c67e1ae057fe5ff4c669cc5ac8))
* session status stuck at running or skipping unseen ([1835a2c](https://github.com/belay-codes/belay/commit/1835a2c7b8bf957aec6ea3f4dbdb6b76d2f518e0))
* set App User Model ID for correct taskbar icon and notification name ([f2689de](https://github.com/belay-codes/belay/commit/f2689de7af2e5f35840a3bf157e29383e2755018))
* stop constant notifications on app startup ([59bf223](https://github.com/belay-codes/belay/commit/59bf223a548fadb8b031ccfc005b0370e7b05dba))
* terminal sessions persist when switching tabs ([f6612a8](https://github.com/belay-codes/belay/commit/f6612a87ae9fefb381125edc0ae1e70a4958167d))
* terminal theme now updates live when switching themes ([3280973](https://github.com/belay-codes/belay/commit/328097341a9b70dea5fd6b94e51b43060e7f7f07))
* terminal toggle button closes panel instead of spawning tabs ([cd4164f](https://github.com/belay-codes/belay/commit/cd4164fd9b9682731c5d8fd57324e08cbdd837a3))
* **ui:** overlay gradient fade on scroll area for smooth message fade ([81ae264](https://github.com/belay-codes/belay/commit/81ae2645da67fb7a0907d9d8391792620131f3c5))
* **ui:** restore terminal panel height transition animation ([42afe30](https://github.com/belay-codes/belay/commit/42afe30d2a9942357e65115fc8b8dcc32f138e91))
* unseen status not working when switching to a different project ([ba9a718](https://github.com/belay-codes/belay/commit/ba9a7184a8c0f9a97ef0a79c9b2e03f1bf1356b7))
* use app.getVersion() in ACP client handshake ([b1f119b](https://github.com/belay-codes/belay/commit/b1f119b0434c90a3322073de43779f94f7220788))
* use flex-1 min-h-0 on Chat root so TerminalPanel can share vertical space ([cfef238](https://github.com/belay-codes/belay/commit/cfef23848908283a6ed90759b90506ac347b8578))
* use main-process notifications for correct app name and icon ([80264f1](https://github.com/belay-codes/belay/commit/80264f1180a03e014bf91d9b3725d2c18c7053e4))
* use proper ANSI colour palettes for default light/dark themes ([23425f8](https://github.com/belay-codes/belay/commit/23425f8a0e92bacf0e8c3d3764be1fce53829cd1))
* WSL terminal spawn — use --cd flag instead of Linux path as cwd ([c36d980](https://github.com/belay-codes/belay/commit/c36d9801fe980f87212698af06ee2049bfc76f83))


### Code Refactoring

* consolidate titlebar into full-width InsetHeader ([5f0600f](https://github.com/belay-codes/belay/commit/5f0600f9d7bb1bf42039b6615445e5b8bb0aaf85))
* migrate to native titlebar ([6df670b](https://github.com/belay-codes/belay/commit/6df670be3a9f5871700223f151ddcf73c4da2649))
* **ui:** move agent and mode selectors below chat input ([0cb769a](https://github.com/belay-codes/belay/commit/0cb769a48ed2e0168dbe5019976c10fb581c0091))
* **ui:** move agent and mode selectors inside prompt box ([2bca7fa](https://github.com/belay-codes/belay/commit/2bca7fa978ba799af6b85d51759ca19c8931bb00))
* **ui:** move send button to bottom controls row ([5eb35a8](https://github.com/belay-codes/belay/commit/5eb35a8d3c4b62c233ad89832fcd49f8cb3b765d))
* **ui:** move terminal panel outside rounded chat container ([23f55f0](https://github.com/belay-codes/belay/commit/23f55f0cc2a2d75512ea71281d74d7494445c7f8))
* **ui:** move terminal toggle to right sidebar ([edaeb14](https://github.com/belay-codes/belay/commit/edaeb148898823aeea75389d6f0ddf901fb4b70c))


### Documentation

* add Elastic License 2.0 (ELv2) ([3e7bacd](https://github.com/belay-codes/belay/commit/3e7bacd1191d4981e823070ff0632c77aa7ef6b3))
* add third-party license notices ([ba61618](https://github.com/belay-codes/belay/commit/ba61618a7d70b4e635ab5afc42a3d5daf0a5d83d))


### Styles

* add padding around the terminal content ([55fa625](https://github.com/belay-codes/belay/commit/55fa625894b12019c7726b8139af3894e2de0aa3))
* apply pointer cursor to clickable sidebar elements ([7daf925](https://github.com/belay-codes/belay/commit/7daf925cc976cf8298cce0ecf2022c60477e7885))
* redesign terminal tabs — pill-shaped, borderless, modern ([19ce8a5](https://github.com/belay-codes/belay/commit/19ce8a5ab634103ef6c5a32d013348229f118d0a))
* refine chat UI styling ([6836dae](https://github.com/belay-codes/belay/commit/6836dae555682b990456a23e0df56b27c5bf59b0))
* **ui:** hide terminal resize separator, show only drag handle ([26d9002](https://github.com/belay-codes/belay/commit/26d90023629d93e0edf4dc4fd9aa2f27b9027dee))
* **ui:** increase prompt box and gradient fade opacity ([112e7f4](https://github.com/belay-codes/belay/commit/112e7f437e4316359be57cfe944d852382e089dd))
* **ui:** match prompt box background to chat area ([f01691a](https://github.com/belay-codes/belay/commit/f01691a696a8c52cb56f4791c7a61054cba03e02))
* **ui:** match shadow color to muted background ([5ed5092](https://github.com/belay-codes/belay/commit/5ed509247d64da79ba47f58780224c80d830622d))
* **ui:** remove hover background from terminal drag handle ([664c4ac](https://github.com/belay-codes/belay/commit/664c4acee5fe6dfcac7d2dce23a8fc13f6d7b48d))
* **ui:** remove prompt box shadow for seamless background ([cd837e0](https://github.com/belay-codes/belay/commit/cd837e00d57866de0505a576b4b883ea92b3f4fc))
* **ui:** remove separator between textarea and controls ([b3c61ac](https://github.com/belay-codes/belay/commit/b3c61acbe4794f7bd93ac1e99dadc7b821471a95))
* **ui:** remove top padding from bottom bar for flush prompt box ([d4ab69b](https://github.com/belay-codes/belay/commit/d4ab69ba0295bb4b76e64b21053fd524cd0d3ad0))
* **ui:** remove top padding from prompt box ([aaaaa15](https://github.com/belay-codes/belay/commit/aaaaa15e02c66a0fdf9e888485cc8a4bfdd82859))
* **ui:** replace separator border with box shadow on prompt box ([25d6b33](https://github.com/belay-codes/belay/commit/25d6b331f8863720cde594de02d88fb3a0cf92ee))
* **ui:** use ghost style for agent and mode selector buttons ([a294b6e](https://github.com/belay-codes/belay/commit/a294b6eef279c7a14a3898c7f99e55def10ae5ff))
* **ui:** use opaque muted background for chat area ([9df3a0d](https://github.com/belay-codes/belay/commit/9df3a0d5bd6bf6a1457d5a31ce7e4790704bc37c))


### Build System

* add ACP dependency ([23630e3](https://github.com/belay-codes/belay/commit/23630e36ec59d9e49ac3668d0debd1a84a6674bc))
