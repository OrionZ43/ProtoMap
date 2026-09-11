<script lang="ts">
    import LegalPage from '$lib/components/LegalPage.svelte';
    import type { PageData } from './$types';

    export let data: PageData;
</script>

<LegalPage
    current="terms"
    doc={data.doc}
    version={data.version}
    description="ProtoMap Terms of Service / End User License Agreement"
/>
