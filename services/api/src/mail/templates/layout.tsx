import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

const colors = {
  primary: "#1d6f86",
  text: "#1f2a30",
  muted: "#55626b",
  background: "#faf8f4",
  border: "#e4e1da",
};

export function Layout(props: {
  lang: string;
  brand: string;
  preview: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <Html lang={props.lang}>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={{ backgroundColor: colors.background, fontFamily: "Inter, Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px" }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: 600, margin: "0 0 24px" }}>
            {props.brand}
          </Text>
          <Section
            style={{
              backgroundColor: "#ffffff",
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: 28,
            }}
          >
            {props.children}
          </Section>
          <Hr style={{ borderColor: colors.border, margin: "24px 0 12px" }} />
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: "18px" }}>{props.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  text: { color: colors.text, fontSize: 16, lineHeight: "24px", margin: "0 0 16px" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: "20px", margin: "16px 0 0" },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    color: "#ffffff",
    display: "inline-block",
    fontSize: 16,
    fontWeight: 600,
    padding: "12px 22px",
    textDecoration: "none",
  },
  code: {
    backgroundColor: "#e3f1f4",
    borderRadius: 10,
    color: colors.text,
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: 6,
    margin: "8px 0 0",
    padding: "12px 0",
    textAlign: "center" as const,
  },
};
