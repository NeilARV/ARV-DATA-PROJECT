import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPost } from "@/api/vendors.api";
import { useToast } from "@/hooks/use-toast";

type CreatePostDialogProps = {
    open: boolean;
    onClose: () => void;
};

export function CreatePostDialog({ open, onClose }: CreatePostDialogProps) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const mutation = useMutation({
        mutationFn: () =>
            createPost({
                title,
                content,
                city: city.trim() || undefined,
                state: state.trim() || undefined,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["posts"] });
            toast({ title: "Post created", description: "Your post has been shared with the community." });
            setTitle("");
            setContent("");
            setCity("");
            setState("");
            onClose();
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to create post. Make sure you have the required access.",
                variant: "destructive",
            });
        },
    });

    const handleClose = () => {
        if (mutation.isPending) return;
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>New Post</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="post-title">Title</Label>
                        <Input
                            id="post-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Give your post a title"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="post-content">Content</Label>
                        <Textarea
                            id="post-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Share your project update, renovation tips, or flip story..."
                            rows={5}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="post-city">City</Label>
                            <Input
                                id="post-city"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="San Diego"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="post-state">State</Label>
                            <Input
                                id="post-state"
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="CA"
                                maxLength={2}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => mutation.mutate()}
                            disabled={!title.trim() || !content.trim() || mutation.isPending}
                        >
                            {mutation.isPending ? "Posting..." : "Post"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
