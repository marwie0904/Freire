import { CubeLoader } from "@/components/ui/cube-loader";

export function CanvasSkeleton() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Dotted Grid Background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
          color: 'var(--foreground)',
        }}
      />

      {/* Cube Loader - Centered */}
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <CubeLoader size="lg" variant="primary" speed="fast" />
      </div>
    </div>
  );
}
