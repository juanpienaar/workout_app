import React from 'react'

const I = ({ children, size = 15, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
)

export const DashboardIcon = (p) => <I {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></I>

export const UsersIcon = (p) => <I {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></I>

export const ProgramsIcon = (p) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></I>

export const ExercisesIcon = (p) => <I {...p}><line x1="2" y1="12" x2="22" y2="12"/><rect x="1" y="9.5" width="3" height="5" rx="1"/><rect x="20" y="9.5" width="3" height="5" rx="1"/><rect x="5" y="8" width="2.5" height="8" rx="1"/><rect x="16.5" y="8" width="2.5" height="8" rx="1"/></I>

export const AIBuilderIcon = (p) => <I {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></I>

export const ImportIcon = (p) => <I {...p}><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></I>

export const DeployIcon = (p) => <I {...p}><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></I>

export const LogoutIcon = (p) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></I>

export const SaveIcon = (p) => <I {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2 2h11l5 5v11z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></I>

export const EditIcon = (p) => <I {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></I>

export const DeleteIcon = (p) => <I {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></I>

export const AddIcon = (p) => <I {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></I>

export const CloseIcon = (p) => <I {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></I>

export const SendIcon = (p) => <I {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></I>

export const SearchIcon = (p) => <I {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></I>

export const MessagesIcon = (p) => <I {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></I>

// Program type icons
export const StrengthIcon = (p) => <I {...p}><line x1="2" y1="12" x2="22" y2="12"/><rect x="1" y="9.5" width="3" height="5" rx="1"/><rect x="20" y="9.5" width="3" height="5" rx="1"/><rect x="5" y="8" width="2.5" height="8" rx="1"/><rect x="16.5" y="8" width="2.5" height="8" rx="1"/></I>

export const CrossfitIcon = (p) => <I {...p}><path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 8h12"/><path d="M6 16h12"/></I>

export const HyroxIcon = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></I>

export const RunningIcon = (p) => <I {...p}><path d="M13 4v4l4 4-4 4v4"/><path d="M7 4v4l-4 4 4 4v4"/></I>

export const CyclingIcon = (p) => <I {...p}><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17L9 4h4l3 7h2"/></I>

export const SwimmingIcon = (p) => <I {...p}><path d="M2 16c1.5-1 3-1.5 4.5 0s3 1 4.5 0 3-1.5 4.5 0 3 1 4.5 0"/><path d="M2 20c1.5-1 3-1.5 4.5 0s3 1 4.5 0 3-1.5 4.5 0 3 1 4.5 0"/><circle cx="12" cy="8" r="2"/><path d="M12 10v2"/></I>

export const SettingsIcon = (p) => <I {...p}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></I>

// Sidebar logo
export const LogoIcon = () => (
  <svg width="28" height="32" viewBox="0 0 28 32" fill="none" style={{ filter: 'drop-shadow(0 0 8px rgba(167,139,250,0.5))' }}>
    <defs>
      <linearGradient id="slg1" x1="14" y1="0" x2="14" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#c4b5fd"/>
        <stop offset="50%" stopColor="#7c6ef0"/>
        <stop offset="100%" stopColor="#2dd4bf"/>
      </linearGradient>
    </defs>
    <path d="M14 16 C14 16 4 10.5 4 6 C4 3.5 6 1.5 8.5 1.5 C10.5 1.5 12 2.8 13 4.2 C14 2.8 15.5 1.5 17.5 1.5 C20 1.5 22 3.5 22 6 C22 10.5 14 16 14 16 Z" fill="url(#slg1)"/>
    <rect x="3" y="15.5" width="22" height="2" rx="1" fill="url(#slg1)" opacity="0.8"/>
    <path d="M5 17.5 L23 17.5 L18 26 L10 26 Z" fill="url(#slg1)" opacity="0.85"/>
    <rect x="10" y="26" width="8" height="4" rx="1.5" fill="url(#slg1)" opacity="0.7"/>
    <rect x="3" y="29.5" width="22" height="2" rx="1" fill="url(#slg1)" opacity="0.7"/>
  </svg>
)

// Icon lookup by name (for dynamic usage)
export const ICON_MAP = {
  dashboard: DashboardIcon,
  users: UsersIcon,
  programs: ProgramsIcon,
  exercises: ExercisesIcon,
  'ai-builder': AIBuilderIcon,
  import: ImportIcon,
  deploy: DeployIcon,
  logout: LogoutIcon,
  save: SaveIcon,
  edit: EditIcon,
  delete: DeleteIcon,
  add: AddIcon,
  close: CloseIcon,
  send: SendIcon,
  search: SearchIcon,
  messages: MessagesIcon,
  settings: SettingsIcon,
  strength: StrengthIcon,
  crossfit: CrossfitIcon,
  hyrox: HyroxIcon,
  running: RunningIcon,
  cycling: CyclingIcon,
  swimming: SwimmingIcon,
}

export function Icon({ name, ...props }) {
  const Comp = ICON_MAP[name]
  return Comp ? <Comp {...props} /> : null
}
