import { Sidebar } from "@/components/sidebar/Sidebar";
import { SearchModal } from "@/components/search/SearchModal";
import { SessionNotices } from "@/components/collab/SessionNotices";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="n-scroll relative min-w-0 flex-1 overflow-y-auto">{children}</main>
      <SearchModal />
      <SessionNotices />
    </div>
  );
}
