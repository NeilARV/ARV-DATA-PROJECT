import { useState } from 'react';
import Header from '../Header';

export default function HeaderExample() {
  const [viewMode, setViewMode] = useState<"map" | "grid">("map");

  return (
    <div>
      <Header
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onUploadClick={() => console.log('Upload clicked')}
        onSearch={(query) => console.log('Search:', query)}
      />
    </div>
  );
}
