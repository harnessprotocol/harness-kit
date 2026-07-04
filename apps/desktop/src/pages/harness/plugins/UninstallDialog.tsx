import { Button, Modal } from "@harness-kit/ui";

interface UninstallDialogProps {
  open: boolean;
  pluginName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export default function UninstallDialog({ open, pluginName, onConfirm, onClose }: UninstallDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Uninstall ${pluginName}?`}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Uninstall
          </Button>
        </div>
      }
    >
      <p style={{ fontSize: "12px", color: "var(--fg-muted)", margin: 0, lineHeight: 1.5 }}>
        This will remove the plugin from <code style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>~/.claude/</code>. Cannot be undone.
      </p>
    </Modal>
  );
}
