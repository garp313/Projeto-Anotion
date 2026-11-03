import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { SearchModal } from "@/components/search/SearchModal";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="n-scroll relative min-w-0 flex-1 overflow-y-auto">{children}</main>
      <SearchModal />
    </div>
  );
}
