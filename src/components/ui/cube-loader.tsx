import { cn } from "@/lib/utils";

interface CubeLoaderProps {
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "primary" | "muted" | "accent";
  speed?: "slow" | "normal" | "fast";
  className?: string;
}

export function CubeLoader({
  size = "md",
  variant = "primary",
  speed = "normal",
  className,
}: CubeLoaderProps) {
  const sizeConfig = {
    xs: {
      container: "w-7 h-7",
      cube: "w-2.5 h-2.5",
      depth: "5px",
    },
    sm: {
      container: "w-8 h-8",
      cube: "w-3 h-3",
      depth: "6px",
    },
    md: {
      container: "w-16 h-16",
      cube: "w-6 h-6",
      depth: "12px",
    },
    lg: {
      container: "w-24 h-24",
      cube: "w-8 h-8",
      depth: "16px",
    },
  };

  // Base colors for each variant
  const variantColors = {
    primary: "hsl(219, 67%, 48%)",
    muted: "hsl(215, 20.2%, 65.1%)",
    accent: "hsl(240, 5.9%, 10%)",
  };

  const baseColor = variantColors[variant];

  const speedClass = speed === "slow"
    ? "animate-cube-rotate-slow"
    : speed === "fast"
    ? "animate-cube-rotate-fast"
    : "animate-cube-rotate";

  return (
    <div
      className={cn(
        "relative flex items-center justify-center flex-shrink-0",
        sizeConfig[size].container,
        className
      )}
      style={{
        perspective: "1000px",
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className={cn(
          "relative",
          sizeConfig[size].cube,
          speedClass
        )}
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "center center",
          backfaceVisibility: "hidden",
          willChange: "transform"
        }}
      >
        {/* Front face - 100% brightness */}
        <div
          className="absolute inset-0 border-2"
          style={{
            backgroundColor: baseColor,
            borderColor: baseColor,
            transform: `translateZ(${sizeConfig[size].depth})`,
            opacity: 1,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: 6,
          }}
        />

        {/* Back face - 40% brightness */}
        <div
          className="absolute inset-0 border-2"
          style={{
            backgroundColor: baseColor,
            borderColor: baseColor,
            transform: `translateZ(-${sizeConfig[size].depth}) rotateY(180deg)`,
            opacity: 0.4,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: 1,
          }}
        />

        {/* Right face - 70% brightness */}
        <div
          className="absolute inset-0 border-2"
          style={{
            backgroundColor: baseColor,
            borderColor: baseColor,
            transform: `rotateY(90deg) translateZ(${sizeConfig[size].depth})`,
            opacity: 0.7,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: 5,
          }}
        />

        {/* Left face - 60% brightness */}
        <div
          className="absolute inset-0 border-2"
          style={{
            backgroundColor: baseColor,
            borderColor: baseColor,
            transform: `rotateY(-90deg) translateZ(${sizeConfig[size].depth})`,
            opacity: 0.6,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: 2,
          }}
        />

        {/* Top face - 85% brightness */}
        <div
          className="absolute inset-0 border-2"
          style={{
            backgroundColor: baseColor,
            borderColor: baseColor,
            transform: `rotateX(90deg) translateZ(${sizeConfig[size].depth})`,
            opacity: 0.85,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: 4,
          }}
        />

        {/* Bottom face - 50% brightness */}
        <div
          className="absolute inset-0 border-2"
          style={{
            backgroundColor: baseColor,
            borderColor: baseColor,
            transform: `rotateX(-90deg) translateZ(${sizeConfig[size].depth})`,
            opacity: 0.5,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            zIndex: 3,
          }}
        />
      </div>
    </div>
  );
}
