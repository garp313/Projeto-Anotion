import { Sidebar } from "@/components/sidebar/Sidebar";
import { SearchModal } from "@/components/search/SearchModal";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="n-scroll relative min-w-0 flex-1 overflow-y-auto">{children}</main>
      <SearchModal />
    </div>
  );
}
