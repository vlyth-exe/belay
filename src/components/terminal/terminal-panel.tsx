import { useState, useEffect, useCallback } from 'react';
import { TerminalView } from './terminal';

interface TerminalPanelProps {
  sessionId: string;
  projectPath?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TerminalPanel({ sessionId, projectPath, isOpen, onClose }: TerminalPanelProps) {
  const [height, setHeight] = useState(250);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setHeight(Math.max(100, Math.min(600, newHeight)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`flex flex-col border-t border-border bg-background ${isDragging ? 'select-none' : ''}`}
      style={{ height: `${height}px` }}
    >
      {/* Drag handle */}
      <div
        className="group relative flex h-1 shrink-0 cursor-row-resize items-center justify-center hover:bg-muted/50"
        onMouseDown={handleDragStart}
      >
        <div className="h-[3px] w-8 rounded-full bg-border transition-colors group-hover:bg-foreground/30" />
      </div>
      {/* Terminal content */}
      <div className="min-h-0 flex-1">
        <TerminalView id={sessionId} cwd={projectPath} onClose={onClose} />
      </div>
    </div>
  );
}
