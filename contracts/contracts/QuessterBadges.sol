// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract QuessterBadges is ERC721, Ownable {
    uint256 private _nextTokenId;

    // Track if an address has already minted
    mapping(address => bool) public hasMinted;

    constructor()
        ERC721("Quesster Genius Badge", "QGB") 
        Ownable(msg.sender)
    {}

    /**
     * @dev Public function to mint a badge. 
     * Limit 1 per wallet to prevent spam.
     */
    function mintBadge() public {
        require(!hasMinted[msg.sender], "You already have a badge!");
        
        uint256 tokenId = _nextTokenId++;
        hasMinted[msg.sender] = true;
        _safeMint(msg.sender, tokenId);
    }

    /**
     * @dev Admin can still mint manually if needed
     */
    function safeMint(address to) public onlyOwner {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }
}