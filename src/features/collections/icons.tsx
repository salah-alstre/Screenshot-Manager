import {
  BarChart3,
  BookOpen,
  Briefcase,
  Bug,
  Camera,
  Code2,
  Film,
  Folder,
  Gamepad2,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Layers,
  Lightbulb,
  MessageSquare,
  Music,
  Palette,
  Plane,
  Receipt,
  Shield,
  ShoppingBag,
  Star,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { colorHex, softBg } from "@/utils/colors";
import { cn } from "@/utils/cn";

// Must match `ICONS` in src-tauri/src/db/collections.rs.
export const COLLECTION_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  code: Code2,
  briefcase: Briefcase,
  receipt: Receipt,
  palette: Palette,
  bug: Bug,
  book: BookOpen,
  star: Star,
  heart: Heart,
  globe: Globe,
  camera: Camera,
  gamepad: Gamepad2,
  music: Music,
  graduation: GraduationCap,
  chart: BarChart3,
  message: MessageSquare,
  shopping: ShoppingBag,
  plane: Plane,
  home: Home,
  lightbulb: Lightbulb,
  shield: Shield,
  terminal: Terminal,
  film: Film,
  layers: Layers,
};

export function CollectionIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string;
  color: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = COLLECTION_ICONS[icon] ?? Folder;
  const box = { xs: "size-5 rounded-md", sm: "size-6 rounded-md", md: "size-8 rounded-lg", lg: "size-11 rounded-xl" }[size];
  const glyph = { xs: "size-3", sm: "size-3.5", md: "size-4", lg: "size-5" }[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", box, className)} style={{ background: softBg(color, 18), color: colorHex(color) }}>
      <Icon className={glyph} />
    </span>
  );
}
