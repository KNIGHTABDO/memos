import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

interface AIDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApply: (text: string, mode: "insert" | "replace") => void;
    contextText?: string;
}

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export default function AIDialog({ open, onOpenChange, onApply, contextText }: AIDialogProps) {
    const [prompt, setPrompt] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState("");

    const handleAskAI = async () => {
        if (!prompt.trim()) return;

        setIsLoading(true);
        setResult("");

        const messages: ChatMessage[] = [
            { role: "system", content: "You are a helpful assistant for YouNote. You help the user write, summarize, or fix their notes. Keep your answers concise and ready to be inserted into a note." },
        ];

        // If specific text is selected or Editor has content, provide it as context
        if (contextText && contextText.trim()) {
            messages.push({ role: "system", content: `Context (Current Note Content):\n---\n${contextText}\n---` });
        }

        messages.push({ role: "user", content: prompt });

        try {
            const response = await fetch("/api/v1/ai/chat_completion", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: messages,
                    model: "openai/gpt-4o", // Explicitly requesting the GitHub Model
                }),
            });

            if (!response.ok) {
                throw new Error(`AI request failed: ${response.statusText}`);
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content || "";
            setResult(content);
        } catch (error) {
            console.error(error);
            toast.error("Failed to get AI response");
        } finally {
            setIsLoading(false);
        }
    };

    const handleApply = (mode: "insert" | "replace") => {
        onApply(result, mode);
        onOpenChange(false);
        setPrompt("");
        setResult("");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-yellow-500" />
                        Ask YouNote AI
                    </DialogTitle>
                    <DialogDescription>
                        Use AI to generate content, fix grammar, or summarize text.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    <Textarea
                        placeholder="e.g. 'Summarize this meeting note' or 'Fix grammar'"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        className="min-h-[100px]"
                    />

                    <div className="flex justify-end">
                        <Button onClick={handleAskAI} disabled={isLoading || !prompt.trim()}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Thinking...
                                </>
                            ) : (
                                <>
                                    <Wand2 className="w-4 h-4 mr-2" />
                                    Generate
                                </>
                            )}
                        </Button>
                    </div>

                    {result && (
                        <div className="mt-4 p-3 bg-muted rounded-md text-sm border">
                            <div className="font-semibold mb-1 text-xs uppercase text-muted-foreground">Result</div>
                            <div className="whitespace-pre-wrap">{result}</div>
                        </div>
                    )}
                </div>

                {result && (
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setResult("")}>Discard</Button>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => handleApply("replace")}>Replace All</Button>
                            <Button onClick={() => handleApply("insert")}>Insert</Button>
                        </div>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
