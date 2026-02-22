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
}