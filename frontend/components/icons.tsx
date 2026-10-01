type Props = { size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false });

export const SearchIcon = ({ size = 16 }: Props) => <svg {...base(size)}><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3.5 3.5" /></svg>;
export const BellIcon = ({ size = 16 }: Props) => <svg {...base(size)}><path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5 1.5 5h-13S5 12 5 8z" /><path d="M8.5 16.5a1.8 1.8 0 0 0 3 0" /></svg>;
export const PlusIcon = ({ size = 16 }: Props) => <svg {...base(size)}><path d="M10 4v12M4 10h12" /></svg>;
export const CommentIcon = ({ size = 14 }: Props) => <svg {...base(size)}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3h0A1.5 1.5 0 0 1 4 11.5z" /></svg>;
export const ChevronIcon = ({ size = 14 }: Props) => <svg {...base(size)}><path d="m6 8 4 4 4-4" /></svg>;
export const CheckIcon = ({ size = 14 }: Props) => <svg {...base(size)}><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>;
export const MenuIcon = ({ size = 18 }: Props) => <svg {...base(size)}><path d="M3.5 6h13M3.5 10h13M3.5 14h13" /></svg>;
export const HomeIcon = ({ size = 18 }: Props) => <svg {...base(size)}><path d="M3.5 9 10 3.5 16.5 9v7h-4.5v-4.5h-4V16H3.5z" /></svg>;
export const ListIcon = ({ size = 18 }: Props) => <svg {...base(size)}><path d="M7 5.5h9M7 10h9M7 14.5h9" /><circle cx="3.8" cy="5.5" r=".6" fill="currentColor" /><circle cx="3.8" cy="10" r=".6" fill="currentColor" /><circle cx="3.8" cy="14.5" r=".6" fill="currentColor" /></svg>;
export const UsersIcon = ({ size = 18 }: Props) => <svg {...base(size)}><circle cx="7.5" cy="7" r="2.8" /><path d="M2.5 16c.5-2.6 2.5-4 5-4s4.5 1.4 5 4" /><path d="M13 4.5a2.6 2.6 0 0 1 0 5M14.5 12.3c1.5.5 2.6 1.7 3 3.7" /></svg>;
