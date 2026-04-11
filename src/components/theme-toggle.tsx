import { Menu } from "@base-ui/react/menu";
import { Palette, Sun, Moon, Monitor } from "lucide-react";
import { useTheme, THEMES } from "@/hooks/use-theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Menu.Root>
      <Menu.Trigger
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Select theme"
      >
        <Palette className="size-3.5" />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="end" className="z-50">
          <Menu.Popup className="w-52 rounded-lg border border-border bg-popover p-1 shadow-lg outline-none">
            {THEMES.map((t) => {
              const active = theme === t.id;

              return (
                <Menu.Item
                  key={t.id}
                  className={
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors " +
                    (active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground")
                  }
                  onClick={() => setTheme(t.id)}
                >
                  <span className="flex-1">{t.label}</span>
                  {t.isDark === true && (
                    <Moon className="size-3 text-muted-foreground/50" />
                  )}
                  {t.isDark === false && (
                    <Sun className="size-3 text-muted-foreground/50" />
                  )}
                  {t.isDark === "system" && (
                    <Monitor className="size-3 text-muted-foreground/50" />
                  )}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
