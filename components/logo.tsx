interface LogoProps {
  className?: string;
  size?: number;
  role?: string;
}

export default function Logo({ className = "", size = 64, role }: LogoProps) {
  const isManager = role === "MANAGER" || role === "SUPER_ADMIN";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={isManager ? "/logo.png" : "/logo1.png"}
      alt="Logo"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
