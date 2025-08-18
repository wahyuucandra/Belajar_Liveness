import SignaturePad from "@/components/organisms/SignaturePad";

export default function SignaturePage() {
    return (
        <main className="min-h-screen p-6 md:p-10 bg-gray-50">
            <div className="max-w-3xl mx-auto space-y-6">
                <h1 className="text-2xl font-semibold text-black">TTD Online</h1>
                <p className="text-gray-600">
                    Tulis tanda tangan di bawah, lalu download PNG.
                </p>
                <SignaturePad />
            </div>
        </main>
    );
}
