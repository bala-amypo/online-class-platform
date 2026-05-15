import LiveClassRoom from '@/components/LiveClassRoom';

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <LiveClassRoom roomId={id} />
    </div>
  );
}
