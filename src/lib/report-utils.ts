export const processTunelCongelacionData = (formData: any) => {
    const placaGroups = (formData.placas || []).map((placa: any) => {
        const itemsByPresentation = (placa.items || []).reduce((acc: any, item: any) => {
            const presentation = item.presentacion || 'SIN PRESENTACIÓN';
            if (!acc[presentation]) {
                acc[presentation] = {
                    presentation: presentation,
                    products: [],
                };
            }
            acc[presentation].products.push(item);
            return acc;
        }, {});

        const presentationGroups = Object.values(itemsByPresentation).map((group: any) => {
             const productsWithSummary = group.products.reduce((acc: any, item: any) => {
                const desc = item.descripcion;
                if (!acc[desc]) {
                     const summaryItem = formData.summary?.find((s: any) => s.descripcion === desc && s.presentacion === group.presentation && s.placa === placa.numeroPlaca);
                     acc[desc] = {
                        descripcion: desc,
                        temperatura1: summaryItem?.temperatura1 || 'N/A',
                        temperatura2: summaryItem?.temperatura2 || 'N/A',
                        temperatura3: summaryItem?.temperatura3 || 'N/A',
                        totalPaletas: 0,
                        totalCantidad: 0,
                        totalPeso: 0,
                    };
                }
                acc[desc].totalPaletas += 1;
                acc[desc].totalCantidad += Number(item.cantidadPorPaleta) || 0;
                acc[desc].totalPeso += Number(item.pesoNeto) || 0;
                return acc;
             }, {});

             const subTotalPaletas = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPaletas, 0);
             const subTotalCantidad = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalCantidad, 0);
             const subTotalPeso = Object.values(productsWithSummary).reduce((sum: number, p: any) => sum + p.totalPeso, 0);

            return {
                presentation: group.presentation,
                products: Object.values(productsWithSummary),
                subTotalPaletas,
                subTotalCantidad,
                subTotalPeso,
            };
        });

        const totalPaletasPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPaletas, 0);
        const totalCantidadPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalCantidad, 0);
        const totalPesoPlaca = presentationGroups.reduce((acc: number, group: any) => acc + group.subTotalPeso, 0);

        return {
            placa: placa.numeroPlaca,
            conductor: placa.conductor,
            cedulaConductor: placa.cedulaConductor,
            presentationGroups: presentationGroups,
            totalPaletasPlaca,
            totalCantidadPlaca,
            totalPesoPlaca,
        };
    });

    const totalGeneralPaletas = placaGroups.reduce((acc, placa) => acc + placa.totalPaletasPlaca, 0);
    const totalGeneralCantidad = placaGroups.reduce((acc, placa) => acc + placa.totalCantidadPlaca, 0);
    const totalGeneralPeso = placaGroups.reduce((acc, placa) => acc + placa.totalPesoPlaca, 0);

    return { placaGroups, totalGeneralPaletas, totalGeneralCantidad, totalGeneralPeso };
};
