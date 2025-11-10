import FilterSidebar from '../FilterSidebar';

export default function FilterSidebarExample() {
  return (
    <div className="h-screen">
      <FilterSidebar 
        onFilterChange={(filters) => console.log('Filters changed:', filters)}
      />
    </div>
  );
}
