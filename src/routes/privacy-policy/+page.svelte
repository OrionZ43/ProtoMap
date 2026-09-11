<script lang="ts">
    import LegalPage from '$lib/components/LegalPage.svelte';
    import type { PageData } from './$types';

    export let data: PageData;
</script>

<LegalPage
    current="privacy"
    doc={data.doc}
    version={data.version}
    description="ProtoMap Privacy Policy and Data Protection"
/>
