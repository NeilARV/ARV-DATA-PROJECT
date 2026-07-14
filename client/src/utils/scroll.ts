/** Smooth-scrolls to a section by id; scroll-mt on the target offsets the sticky nav. */
export function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
