"use client";

import { useState, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle, Loader2, Upload, XCircle, RotateCcw, Save, Settings,
  Sparkles, Wand2, ImageUp, IdCard, ScanFace, PenLine, Link, ClipboardCopy,
} from "lucide-react";

interface ApiResponse { [key: string]: any; }

export default function FileUploadTest() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("quality");
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  const router = useRouter();
  const signatureRef = useRef<SignatureCanvas>(null);

  const [apiBaseUrl, setApiBaseUrl] = useState(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://econtract-dev.berijalan.id/engine"
  );

  // progress simulation
  const startProgress = () => {
    setProgress(10);
    const i = setInterval(() => setProgress(p => (p < 90 ? p + 10 : p)), 250);
    return () => clearInterval(i);
  };

  const handleFileUpload = async (
    endpoint: string,
    files: Record<string, File>,
    params: Record<string, string | number | boolean> = {}
  ) => {
    setLoading(true);
    setError(null);
    setResponse(null);
    const stop = startProgress();

    try {
      const formData = new FormData();
      Object.entries(files).forEach(([k, f]) => formData.append(k, f));

      const search = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => search.append(k, String(v)));

      const url = `${apiBaseUrl}${endpoint}${search.toString() ? `?${search}` : ""}`;
      const res = await fetch(url, { method: "POST", body: formData });

      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      const data = await res.json();
      setResponse(data);
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred");
      setProgress(0);
    } finally {
      stop();
      setLoading(false);
      setTimeout(() => setProgress(0), 700);
    }
  };

  const prettyJson = useMemo(
    () => (response ? JSON.stringify(response, null, 2) : ""),
    [response]
  );

  // --------- UI bits
  const FileName = ({ file }: { file: File | null }) =>
    file ? <p className="text-xs text-muted-foreground truncate">{file.name}</p> : null;

  const Dropzone = ({
    id, accept, onFile, icon: Icon, label, hint,
  }: {
    id: string; accept: string; onFile: (f: File | null) => void;
    icon: any; label: string; hint?: string;
  }) => (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <label
        htmlFor={id}
        className="dropzone card-surface flex cursor-pointer items-center justify-center rounded-2xl border-dashed p-6 text-center"
      >
        <div className="flex flex-col items-center gap-2">
          <Icon className="h-8 w-8" />
          <span className="text-sm font-medium">Drop or click to upload</span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </div>
      </label>
      <Input
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );

  const QualityCheckTab = () => {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [blurThr, setBlurThr] = useState(120);
    const [darkThr, setDarkThr] = useState(70);
    const [contrastThr, setContrastThr] = useState(35);
    const [returnOverlay, setReturnOverlay] = useState(false);

    const submit = () => {
      if (!imageFile) return setError("Please select an image file");
      handleFileUpload("/quality", { image: imageFile }, {
        blur_thr: blurThr, dark_thr: darkThr, contrast_thr: contrastThr, return_overlay: returnOverlay,
      });
    };

    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Dropzone id="image" accept="image/*" onFile={setImageFile} icon={ImageUp} label="Image File" hint="PNG, JPG, HEIC" />
            <FileName file={imageFile} />
          </div>

          <div className="card-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <h4 className="font-semibold">Quality thresholds</h4>
            </div>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="blur-thr">Blur Threshold</Label>
                  <span className="text-xs text-muted-foreground">{blurThr}</span>
                </div>
                <Slider id="blur-thr" value={[blurThr]} min={0} max={300} step={1} onValueChange={(v) => setBlurThr(v[0])} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="dark-thr">Dark Threshold</Label>
                  <span className="text-xs text-muted-foreground">{darkThr}</span>
                </div>
                <Slider id="dark-thr" value={[darkThr]} min={0} max={255} step={1} onValueChange={(v) => setDarkThr(v[0])} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="contrast-thr">Contrast Threshold</Label>
                  <span className="text-xs text-muted-foreground">{contrastThr}</span>
                </div>
                <Slider id="contrast-thr" value={[contrastThr]} min={0} max={100} step={1} onValueChange={(v) => setContrastThr(v[0])} />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="return-overlay" checked={returnOverlay} onCheckedChange={setReturnOverlay} />
                <Label htmlFor="return-overlay">Return overlay image</Label>
              </div>
            </div>
          </div>
        </div>

        <Button onClick={submit} disabled={loading || !imageFile} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
          Check Quality
        </Button>
      </div>
    );
  };

  const SignatureExtractTab = () => {
    const [ktpFile, setKtpFile] = useState<File | null>(null);
    const [cropBottom, setCropBottom] = useState(0.45);
    const [minAreaRatio, setMinAreaRatio] = useState(0.01);

    const submit = () => {
      if (!ktpFile) return setError("Please select a KTP file");
      handleFileUpload("/signature", { ktp: ktpFile }, { crop_bottom: cropBottom, min_area_ratio: minAreaRatio });
    };

    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Dropzone id="ktp" accept="image/*" onFile={setKtpFile} icon={IdCard} label="KTP File" />
            <FileName file={ktpFile} />
          </div>

          <div className="card-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <h4 className="font-semibold">Extraction options</h4>
            </div>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="crop-bottom">Crop Bottom</Label>
                  <span className="text-xs text-muted-foreground">{cropBottom.toFixed(2)}</span>
                </div>
                <Slider id="crop-bottom" value={[cropBottom]} min={0} max={1} step={0.01} onValueChange={(v) => setCropBottom(v[0])} />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="min-area-ratio">Min Area Ratio</Label>
                  <span className="text-xs text-muted-foreground">{minAreaRatio.toFixed(3)}</span>
                </div>
                <Slider id="min-area-ratio" value={[minAreaRatio]} min={0} max={0.2} step={0.001} onValueChange={(v) => setMinAreaRatio(v[0])} />
              </div>
            </div>
          </div>
        </div>

        <Button onClick={submit} disabled={loading || !ktpFile} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Extract Signature
        </Button>
      </div>
    );
  };

  const FaceCompareTab = () => {
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [idImageFile, setIdImageFile] = useState<File | null>(null);
    const [threshold, setThreshold] = useState(0.42);

    const submit = () => {
      if (!selfieFile || !idImageFile) return setError("Please select both selfie and ID image files");
      handleFileUpload("/face-compare", { selfie: selfieFile, idimage: idImageFile }, { threshold });
    };

    return (
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <div className="space-y-2">
              <Dropzone id="selfie" accept="image/*" onFile={setSelfieFile} icon={ScanFace} label="Selfie File" />
              <FileName file={selfieFile} />
            </div>
            <div className="space-y-2">
              <Dropzone id="idimage" accept="image/*" onFile={setIdImageFile} icon={IdCard} label="ID Image File" />
              <FileName file={idImageFile} />
            </div>
          </div>

          <div className="card-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <h4 className="font-semibold">Compare options</h4>
            </div>
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="threshold">Threshold</Label>
                  <span className="text-xs text-muted-foreground">{threshold.toFixed(2)}</span>
                </div>
                <Slider id="threshold" value={[threshold]} min={0} max={1} step={0.01} onValueChange={(v) => setThreshold(v[0])} />
              </div>
            </div>
          </div>
        </div>

        <Button onClick={submit} disabled={loading || !selfieFile || !idImageFile} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Compare Faces
        </Button>
      </div>
    );
  };

  const SignatureDrawTab = () => {
    const reset = () => signatureRef.current?.clear();
    const save = () => {
      if (!signatureRef.current) return;
      const data = signatureRef.current.toDataURL();
      setSavedSignature(data);
    };

    return (
      <div className="space-y-6">
        <div>
          <Label>Draw Your Signature</Label>
          <div className="relative mt-2 h-[220px] w-full card-surface">
            <SignatureCanvas
              ref={signatureRef}
              backgroundColor="rgb(255, 255, 255)"
              penColor="black"
              minWidth={1}
              maxWidth={3}
              canvasProps={{ style: { position: "absolute", inset: 0, width: "100%", height: "100%" } }}
            />
          </div>
        </div>

        <div className="flex gap-4">
          <Button onClick={reset} variant="outline" className="flex-1">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <Button onClick={save} className="flex-1">
            <Save className="mr-2 h-4 w-4" />
            Save Signature
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen app-bg">
      <div className="container mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="card-surface mb-8 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                <Sparkles className="h-7 w-7" /> E-Contract Vision API Test
              </h1>
              <p className="text-muted-foreground">
                Test endpoints for quality check, signature extraction, and face comparison.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(apiBaseUrl)}>
                <ClipboardCopy className="mr-2 h-4 w-4" /> Copy Base URL
              </Button>
              <Button className="text-white" onClick={() => router.push("/menu")}>
                <Link className="mr-2 h-4 w-4" /> Go to Menu
              </Button>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label className="mb-2 block" htmlFor="api-url">API Base URL</Label>
              <Input id="api-url" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="http://localhost:8000" />
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ImageUp className="h-5 w-5" />
                <CardTitle>Tools</CardTitle>
              </div>
              <CardDescription>Choose an action below</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 gap-1 border-b">
                  <TabsTrigger value="quality" className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Quality</TabsTrigger>
                  <TabsTrigger value="signature" className="flex items-center gap-2"><PenLine className="h-4 w-4" /> Signature</TabsTrigger>
                  <TabsTrigger value="face-compare" className="flex items-center gap-2"><ScanFace className="h-4 w-4" /> Face</TabsTrigger>
                  <TabsTrigger value="signature-draw" className="flex items-center gap-2"><PenLine className="h-4 w-4" /> Draw</TabsTrigger>
                </TabsList>

                <TabsContent value="quality"><QualityCheckTab /></TabsContent>
                <TabsContent value="signature"><SignatureExtractTab /></TabsContent>
                <TabsContent value="face-compare"><FaceCompareTab /></TabsContent>
                <TabsContent value="signature-draw"><SignatureDrawTab /></TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Right */}
          <div className="space-y-6">
            {error && (
              <Alert className="border-red-200 bg-red-50" role="alert" aria-live="polite">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">{error}</AlertDescription>
              </Alert>
            )}

            {response && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" /> API Response
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="muted-block rounded-xl p-4 overflow-auto text-sm">{prettyJson}</pre>
                </CardContent>
              </Card>
            )}

            {activeTab === "signature" && response?.signature_png_b64 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" /> Signature
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Image
                    src={`data:image/png;base64,${response.signature_png_b64}`}
                    alt="Signature"
                    className="w-full max-w-md rounded-xl border"
                    width={800}
                    height={400}
                  />
                </CardContent>
              </Card>
            )}

            {activeTab === "quality" && response?.overlay_png_b64 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" /> Overlay
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Image
                    src={`data:image/png;base64,${response.overlay_png_b64}`}
                    alt="Overlay"
                    className="w-full max-w-md rounded-xl border"
                    width={800}
                    height={800}
                  />
                </CardContent>
              </Card>
            )}

            {activeTab === "signature-draw" && savedSignature && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" /> Saved Signature
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Image src={savedSignature} alt="Saved Signature" className="w-full max-w-md rounded-xl border" width={800} height={300} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" /> Tips
                </CardTitle>
                <CardDescription>
                  Use high-resolution images and ensure the face/signature area is clearly visible.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
