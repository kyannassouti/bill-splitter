export interface Item {
    id: string;
    name: string;
    price: number;
    qty: number;
}
  
export interface Participant {
    id: string;
    name: string;
}

export interface ItemShare {
    participantId: string;
    itemId: string;
    proportion: number;  // 0.0 to 1.0 (0% to 100%)
    splitMethod: 'qty' | 'percentage';  // how the user chose to split this item
    // How the claim was entered (null on older shares): how many of the item,
    // people splitting them (1 = just me), and shares of that split covered
    count?: number | null;
    ways?: number | null;
    covered?: number | null;
}