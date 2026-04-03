import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </main>
  );
}
