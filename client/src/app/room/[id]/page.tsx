import { Metadata } from 'next';
import LiveClassRoom from '@/components/LiveClassRoom';

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}): Promise<Metadata> {
  const { id } = await params;
  const displayId = id.charAt(0).toUpperCase() + id.slice(1);
  return {
    title: `Classroom: ${displayId} | Dot Live`,
    description: `Join classroom ${displayId} on Dot Live platform`
  };
}

export default async function RoomPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<{ role?: string }>
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const role = resolvedSearchParams.role || 'student';

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <LiveClassRoom roomId={id} initialRole={role} />
    </div>
  );
}
