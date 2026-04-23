import { AnnouncementTicker } from '@/components/dashboard/announcement-ticker';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AnnouncementTicker />
    </>
  );
}
