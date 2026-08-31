import OwnWorkspace from "@/components/OwnWorkspace";

/**
 * Susan's workspace — the whole business, at its own address.
 *
 * It used to be /admin/business, which is how James found this: signed in as
 * Susan, he could still see his admin section, and so could she. A screen
 * somebody owns should not be a page inside somebody else's area, and the URL
 * saying "admin" was the same mistake written down.
 *
 * The page itself is unchanged — same tabs, same live figures, same month
 * scoping. Only the door moved.
 */
export default function CompanyFiguresLayout({ children }: { children: React.ReactNode }) {
  return <OwnWorkspace needs="see:business">{children}</OwnWorkspace>;
}
