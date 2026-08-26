# Component structure

```text
App
├─ AuthScreen (login, registration, OTP, profile setup)
├─ DesignPreview (state router)
├─ MessagingApp
│  ├─ SideNav
│  ├─ ConversationList → ConversationRow → Avatar
│  ├─ ChatPanel → MessageBubble / Notifications / Composer
│  ├─ ContactsPage / AddContact
│  ├─ CallHistory
│  ├─ SettingsPage
│  └─ CallScreen (incoming, outgoing, voice, video)
└─ AdminShell
   ├─ AdminNav
   ├─ AdminOverview
   ├─ AdminUsers → UserDrawer
   ├─ AdminMessages
   └─ AdminRecordings → Recording player modal
```

`LiveApp` owns authentication, messaging, LiveKit call media, and the `/admin` recording vault. It restores the HTTP-only session, loads authorized server data, maintains one Socket.IO connection, and lazy-loads the LiveKit browser SDK only when a call connects. `App` retains the original component library behind `/design-preview`. A later package split can move shared primitives into `packages/ui` and API contracts into a shared package.

## Design tokens

- Background: true white `#fff`; dark `#15131a`
- Text: ink `#171821`; muted `#747581`
- Accent: orchid `#6b35da`; selected state `#f1ebff`
- Semantic: success `#31b862`, destructive `#f24d57`
- Radius: 10, 14, 18, 24px; circular icon buttons
- Type: local operating-system sans-serif stack; 11–14px chrome, 22–38px headings
- Icons: consistent two-pixel rounded Lucide outlines
- Containers: open rails/lists/tables, one framed chat composer, restrained drawers/popovers

At `<760px`, desktop multi-panel navigation becomes a single-pane list → full-screen detail flow. Controls respect safe-area insets and use 42–62px targets.
