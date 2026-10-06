import { Component } from "react";
import { resolveLanguage } from "../i18n";

// A render error anywhere below used to unmount the whole React tree: a blank white page, no
// message, and — on a cleaner's phone, mid-shift — nothing to tap. Seen twice in production
// (a variable used outside its component; a sort menu that called null). One bad page now shows this
// card instead, and everything outside it keeps working.
//
// The strings are kept here rather than in the locale files on purpose: this has to work when the
// thing that broke is the translation layer itself, and it must never be missing a key.
const TEXT = {
  no: { title: "Noe gikk galt", body: "Siden kunne ikke vises. Det du har registrert er lagret.", retry: "Prøv igjen", reload: "Last inn på nytt" },
  en: { title: "Something went wrong", body: "This page could not be shown. What you have recorded is saved.", retry: "Try again", reload: "Reload" },
  lt: { title: "Kažkas nepavyko", body: "Šio puslapio nepavyko parodyti. Tai, ką įvedėte, išsaugota.", retry: "Bandyti dar kartą", reload: "Įkelti iš naujo" },
  lv: { title: "Kaut kas nogāja greizi", body: "Šo lapu neizdevās parādīt. Tas, ko esat ievadījis, ir saglabāts.", retry: "Mēģināt vēlreiz", reload: "Pārlādēt" },
  ru: { title: "Что-то пошло не так", body: "Не удалось показать эту страницу. Введённые вами данные сохранены.", retry: "Повторить", reload: "Перезагрузить" },
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Render error caught by ErrorBoundary:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    let lang = "no";
    try {
      lang = resolveLanguage(null);
    } catch {
      // Falls back to Norwegian.
    }
    const text = TEXT[lang] || TEXT.no;
    return (
      <div role="alert" style={{ maxWidth: 520, margin: "40px auto", padding: "0 16px" }}>
        <div style={{
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
          padding: 20,
        }}>
          <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{text.title}</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 16 }}>{text.body}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={this.reset} style={buttonStyle(false)}>{text.retry}</button>
            <button type="button" onClick={() => window.location.reload()} style={buttonStyle(true)}>{text.reload}</button>
          </div>
        </div>
      </div>
    );
  }
}

function buttonStyle(primary) {
  return {
    padding: "10px 16px", borderRadius: "var(--radius)", fontSize: 14, fontWeight: 600, cursor: "pointer",
    border: primary ? "none" : "1px solid var(--border)",
    background: primary ? "var(--brand)" : "var(--surface-0)",
    color: primary ? "white" : "var(--text-primary)",
  };
}
