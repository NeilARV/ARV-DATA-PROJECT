import { useState } from 'react';
import UploadDialog from '../UploadDialog';
import { Button } from '@/components/ui/button';

export default function UploadDialogExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)} data-testid="button-open-upload">
        Open Upload Dialog
      </Button>
      <UploadDialog
        open={open}
        onClose={() => setOpen(false)}
        onUpload={(properties) => console.log('Uploaded properties:', properties)}
      />
    </div>
  );
}
