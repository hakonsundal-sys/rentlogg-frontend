import { Languages } from "lucide-react";
import { LANGUAGES, useI18n } from "../i18n";

// A plain <select>, not a custom dropdown: on a phone this opens the OS's own language-sized
// picker with the system font, which renders Cyrillic and Baltic diacritics correctly and is
// operable with wet or gloved hands — both of which a hand-rolled menu in this codebase's style
// would have to earn back. Labels are endonyms (see LANGUAGES), so the list is readable to
// someone who can't yet read anything else on the screen.
export default function LanguagePicker({ compact = false }) {
  const { language, setLanguage, t } = useI18n();

  return (
    <label
      title={t("language.change")}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}
    >
      <Languages size={compact ? 14 : 16} aria-hidden="true" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        aria-label={t("language.label")}
        style={{
          background: "var(--surface-0)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: compact ? "3px 6px" : "5px 8px",
          fontSize: compact ? 12.5 : 13,
          cursor: "pointer",
        }}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
